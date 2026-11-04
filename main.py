"""
Group Applicant Tracking System — FastAPI application.
"""
import csv
import io
import threading
from datetime import datetime

from fastapi import (
    FastAPI, Request, Depends, HTTPException, Form, UploadFile, File, Response
)
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import (
    get_settings, COMPANIES, COMPANY_BY_CODE, SOURCES, PIPELINE, STAGE_BY_KEY,
    ACTIVE_STAGES, load_form_fields,
)
from database import get_db
from models import Company, User, Candidate, StageHistory
from schemas import LoginIn, StageChangeIn, UserIn, UserUpdateIn
import auth
import pdf_gen
import excel_log
import onedrive
import notify

settings = get_settings()
app = FastAPI(title="Group ATS")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ----------------------------- helpers ------------------------------------
def company_scope(user: User, db: Session):
    q = db.query(Candidate)
    if user.role != "super_admin" and user.company_id:
        q = q.filter(Candidate.company_id == user.company_id)
    return q


def accessible_companies(user: User, db: Session):
    if user.role == "super_admin":
        return db.query(Company).all()
    return db.query(Company).filter(Company.id == user.company_id).all()


def can_touch(user: User, candidate: Candidate) -> bool:
    return user.role == "super_admin" or candidate.company_id == user.company_id


def sync_to_onedrive(candidate_id: int):
    if not onedrive.graph_configured():
        return
    from database import SessionLocal
    db = SessionLocal()
    try:
        c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not c:
            return
        company = c.company
        try:
            pdf = pdf_gen.build_candidate_pdf(c)
            safe = "".join(ch for ch in (c.name or "candidate") if ch.isalnum() or ch in " _-").strip()
            fname = f"{c.id:05d}_{safe}.pdf"
            year = str((c.created_at or datetime.utcnow()).year)
            url, path = onedrive.upload_bytes(
                [settings.ATS_ROOT_FOLDER, company.code, year], fname, pdf,
                content_type="application/pdf")
            c.pdf_url, c.pdf_path = url, path
            db.commit()
        except Exception as e:  # noqa: BLE001
            print("PDF sync failed:", e)
        try:
            cands = db.query(Candidate).filter(Candidate.company_id == company.id).order_by(Candidate.id).all()
            excel_log.sync_company_excel(company.code, cands)
        except Exception as e:  # noqa: BLE001
            print("Excel sync failed:", e)
    finally:
        db.close()


def fire(candidate_id: int):
    threading.Thread(target=sync_to_onedrive, args=(candidate_id,), daemon=True).start()


def fire_notify(candidate_id: int):
    """Background: email HR about a new application. Safe no-op if not configured."""
    def _go():
        from database import SessionLocal
        s = SessionLocal()
        try:
            c = s.query(Candidate).filter(Candidate.id == candidate_id).first()
            if c:
                notify.send_new_application_email(c)
        except Exception as e:  # noqa: BLE001
            print("HR notify thread failed:", e)
        finally:
            s.close()
    threading.Thread(target=_go, daemon=True).start()


def ctx(request, user=None, **extra):
    base = {
        "request": request, "user": user, "companies": COMPANIES,
        "sources": SOURCES, "pipeline": PIPELINE, "stage_by_key": STAGE_BY_KEY,
        "form_fields": load_form_fields(), "public_base": settings.PUBLIC_BASE_URL,
    }
    base.update(extra)
    return base


# ----------------------------- auth ---------------------------------------
@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, db: Session = Depends(get_db)):
    if auth.get_optional_user(request, db):
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse(request, "login.html", ctx(request))


@app.post("/api/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == body.email.lower()).first()
    if not user or not user.is_active or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth.create_token(user)
    response.set_cookie(auth.COOKIE_NAME, token, httponly=True, samesite="lax",
                        max_age=settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600)
    return {"ok": True}


@app.get("/logout")
def logout():
    resp = RedirectResponse("/login", status_code=302)
    resp.delete_cookie(auth.COOKIE_NAME)
    return resp


# ----------------------------- pages --------------------------------------
@app.get("/", response_class=HTMLResponse)
def dashboard_page(request: Request, db: Session = Depends(get_db)):
    user = auth.get_optional_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard.html",
                                      ctx(request, user, companies_db=accessible_companies(user, db)))


@app.get("/candidates", response_class=HTMLResponse)
def candidates_page(request: Request, db: Session = Depends(get_db)):
    user = auth.get_optional_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse(request, "candidates.html",
                                      ctx(request, user, companies_db=accessible_companies(user, db)))


@app.get("/candidates/{cid}", response_class=HTMLResponse)
def candidate_detail_page(cid: int, request: Request, db: Session = Depends(get_db)):
    user = auth.get_optional_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)
    c = db.query(Candidate).filter(Candidate.id == cid).first()
    if not c or not can_touch(user, c):
        raise HTTPException(status_code=404, detail="Candidate not found")
    return templates.TemplateResponse(request, "candidate_detail.html", ctx(request, user, cid=cid))


@app.get("/admin/users", response_class=HTMLResponse)
def admin_users_page(request: Request, db: Session = Depends(get_db)):
    user = auth.get_optional_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return templates.TemplateResponse(request, "admin_users.html", ctx(request, user))


# ----------------------------- whoami -------------------------------------
@app.get("/api/me")
def me(user: User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return {
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
        "company_code": user.company.code if user.company else None,
        "company_name": user.company.name if user.company else "All Companies",
        "companies": [{"code": c.code, "name": c.name} for c in accessible_companies(user, db)],
    }


# ----------------------------- dashboard data -----------------------------
@app.get("/api/dashboard")
def dashboard_data(request: Request, company: str = "", db: Session = Depends(get_db),
                   user: User = Depends(auth.get_current_user)):
    q = company_scope(user, db)
    if company and (user.role == "super_admin"):
        cdb = db.query(Company).filter(Company.code == company).first()
        if cdb:
            q = q.filter(Candidate.company_id == cdb.id)

    cands = q.all()
    by_stage, by_source, by_company = {}, {}, {}
    for c in cands:
        by_stage[c.stage] = by_stage.get(c.stage, 0) + 1
        by_source[c.source or "Other"] = by_source.get(c.source or "Other", 0) + 1
        code = c.company.code if c.company else "?"
        by_company[code] = by_company.get(code, 0) + 1

    total = len(cands)
    active = sum(v for k, v in by_stage.items() if STAGE_BY_KEY.get(k, {}).get("type") == "active")
    joined = by_stage.get("joined", 0)
    lost = sum(v for k, v in by_stage.items() if STAGE_BY_KEY.get(k, {}).get("type") == "lost")
    funnel = [{"key": s["key"], "label": s["label"], "count": by_stage.get(s["key"], 0)}
              for s in PIPELINE if s["type"] in ("active", "won")]
    return {"total": total, "active": active, "joined": joined, "lost": lost,
            "by_stage": by_stage, "by_source": by_source, "by_company": by_company, "funnel": funnel}


# ----------------------------- candidate list -----------------------------
@app.get("/api/candidates")
def list_candidates(request: Request, db: Session = Depends(get_db),
                    user: User = Depends(auth.get_current_user),
                    company: str = "", stage: str = "", source: str = "",
                    q: str = "", page: int = 1, page_size: int = 50):
    query = company_scope(user, db)
    if company and user.role == "super_admin":
        cdb = db.query(Company).filter(Company.code == company).first()
        if cdb:
            query = query.filter(Candidate.company_id == cdb.id)
    if stage:
        query = query.filter(Candidate.stage == stage)
    if source:
        query = query.filter(Candidate.source == source)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Candidate.name.ilike(like)) | (Candidate.email.ilike(like)) |
            (Candidate.phone.ilike(like)) | (Candidate.position.ilike(like)))
    total = query.count()
    rows = query.order_by(Candidate.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [{
            "id": c.id, "name": c.name, "email": c.email, "phone": c.phone,
            "position": c.position, "source": c.source, "stage": c.stage,
            "stage_label": STAGE_BY_KEY.get(c.stage, {}).get("label", c.stage),
            "stage_type": STAGE_BY_KEY.get(c.stage, {}).get("type", "active"),
            "company": c.company.code if c.company else "",
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        } for c in rows],
    }


@app.get("/api/candidates/{cid}")
def get_candidate(cid: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_user)):
    c = db.query(Candidate).filter(Candidate.id == cid).first()
    if not c or not can_touch(user, c):
        raise HTTPException(status_code=404, detail="Not found")
    stage = STAGE_BY_KEY.get(c.stage, {})
    return {
        "id": c.id, "name": c.name, "email": c.email, "phone": c.phone,
        "position": c.position, "source": c.source,
        "company": c.company.code if c.company else "",
        "company_name": c.company.name if c.company else "",
        "stage": c.stage, "stage_label": stage.get("label", c.stage),
        "stage_type": stage.get("type", "active"), "actions": stage.get("actions", []),
        "form_data": c.form_data or {},
        "interview_at": c.interview_at.isoformat() if c.interview_at else None,
        "interview_mode": c.interview_mode, "interviewer": c.interviewer,
        "interview_result": c.interview_result,
        "joining_date": c.joining_date.isoformat() if c.joining_date else None,
        "pdf_url": c.pdf_url, "resume_url": c.resume_url,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "history": [{
            "from": STAGE_BY_KEY.get(h.from_stage, {}).get("label", h.from_stage),
            "to": STAGE_BY_KEY.get(h.to_stage, {}).get("label", h.to_stage),
            "note": h.note, "by": h.changed_by_name,
            "at": h.changed_at.isoformat() if h.changed_at else None,
        } for h in c.history],
    }


# ----------------------------- stage transition ---------------------------
@app.post("/api/candidates/{cid}/stage")
def change_stage(cid: int, body: StageChangeIn, db: Session = Depends(get_db),
                 user: User = Depends(auth.get_current_user)):
    c = db.query(Candidate).filter(Candidate.id == cid).first()
    if not c or not can_touch(user, c):
        raise HTTPException(status_code=404, detail="Not found")
    if body.to_stage not in STAGE_BY_KEY:
        raise HTTPException(status_code=400, detail="Unknown stage")
    from_stage = c.stage
    if body.interview_at:
        try:
            c.interview_at = datetime.fromisoformat(body.interview_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad interview date")
        c.interview_mode = body.interview_mode
        c.interviewer = body.interviewer
    if body.interview_result:
        c.interview_result = body.interview_result
    if body.joining_date:
        try:
            c.joining_date = datetime.fromisoformat(body.joining_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad joining date")
    c.stage = body.to_stage
    db.add(StageHistory(candidate_id=c.id, from_stage=from_stage, to_stage=body.to_stage,
                        note=body.note or "", changed_by_id=user.id, changed_by_name=user.name))
    db.commit()
    fire(c.id)
    return {"ok": True, "stage": c.stage}


# ----------------------------- manual add ---------------------------------
@app.post("/api/candidates")
def add_candidate(payload: dict, db: Session = Depends(get_db),
                  user: User = Depends(auth.get_current_user)):
    company_code = payload.get("company_code")
    source = payload.get("source", "Other")
    form_data = payload.get("form_data", {}) or {}
    if user.role != "super_admin":
        company_code = user.company.code
    comp = db.query(Company).filter(Company.code == company_code).first()
    if not comp:
        raise HTTPException(status_code=400, detail="Unknown company")
    c = _create_candidate(db, comp, source, form_data, created_via="manual")
    db.add(StageHistory(candidate_id=c.id, from_stage=None, to_stage="applied",
                        note="Added manually", changed_by_id=user.id, changed_by_name=user.name))
    db.commit()
    fire(c.id)
    return {"ok": True, "id": c.id}


def _create_candidate(db, comp, source, form_data, created_via):
    fields = load_form_fields()
    core = {f["core"]: form_data.get(f["key"]) for f in fields if f.get("core")}
    c = Candidate(
        company_id=comp.id,
        name=core.get("name") or form_data.get("full_name") or "Unnamed",
        email=core.get("email"), phone=core.get("phone"),
        position=core.get("position") or "—",
        source=source, form_data=form_data, stage="applied", created_via=created_via)
    db.add(c)
    db.flush()
    return c


# ----------------------------- resume upload ------------------------------
@app.post("/api/candidates/{cid}/resume")
async def upload_resume(cid: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                        user: User = Depends(auth.get_current_user)):
    c = db.query(Candidate).filter(Candidate.id == cid).first()
    if not c or not can_touch(user, c):
        raise HTTPException(status_code=404, detail="Not found")
    content = await file.read()
    if onedrive.graph_configured():
        year = str((c.created_at or datetime.utcnow()).year)
        url, path = onedrive.upload_bytes(
            [settings.ATS_ROOT_FOLDER, c.company.code, year, "resumes"],
            f"{c.id:05d}_{file.filename}", content,
            content_type=file.content_type or "application/octet-stream")
        c.resume_url, c.resume_path = url, path
        db.commit()
        return {"ok": True, "url": url}
    raise HTTPException(status_code=400, detail="OneDrive not configured")


@app.get("/api/candidates/{cid}/pdf")
def candidate_pdf(cid: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_user)):
    c = db.query(Candidate).filter(Candidate.id == cid).first()
    if not c or not can_touch(user, c):
        raise HTTPException(status_code=404, detail="Not found")
    pdf = pdf_gen.build_candidate_pdf(c)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="candidate_{cid}.pdf"'})


@app.post("/api/candidates/{cid}/sync")
def sync_now(cid: int, db: Session = Depends(get_db), user: User = Depends(auth.get_current_user)):
    c = db.query(Candidate).filter(Candidate.id == cid).first()
    if not c or not can_touch(user, c):
        raise HTTPException(status_code=404, detail="Not found")
    if not onedrive.graph_configured():
        raise HTTPException(status_code=400, detail="OneDrive not configured on the server")
    fire(c.id)
    return {"ok": True, "message": "Sync started"}


# ----------------------------- CSV import ---------------------------------
@app.post("/api/import")
async def import_csv(company_code: str = Form(...), source: str = Form("Other"),
                     file: UploadFile = File(...), db: Session = Depends(get_db),
                     user: User = Depends(auth.get_current_user)):
    if user.role != "super_admin":
        company_code = user.company.code
    comp = db.query(Company).filter(Company.code == company_code).first()
    if not comp:
        raise HTTPException(status_code=400, detail="Unknown company")
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    fields = load_form_fields()
    label_to_key = {f["label"].lower(): f["key"] for f in fields}
    key_set = {f["key"] for f in fields}
    created = 0
    for row in reader:
        form_data = {}
        for col, val in row.items():
            if col is None:
                continue
            key = col.strip()
            if key in key_set:
                form_data[key] = val
            elif key.lower() in label_to_key:
                form_data[label_to_key[key.lower()]] = val
        if not any(form_data.values()):
            continue
        row_source = (row.get("source") or row.get("Source") or source).strip() or source
        c = _create_candidate(db, comp, row_source, form_data, created_via="import")
        db.add(StageHistory(candidate_id=c.id, from_stage=None, to_stage="applied",
                            note=f"Imported ({row_source})", changed_by_id=user.id, changed_by_name=user.name))
        created += 1
    db.commit()
    fire_company_excel(db, comp.id)
    return {"ok": True, "created": created}


def fire_company_excel(db, company_id):
    def _go():
        from database import SessionLocal
        s = SessionLocal()
        try:
            comp = s.query(Company).filter(Company.id == company_id).first()
            cands = s.query(Candidate).filter(Candidate.company_id == company_id).order_by(Candidate.id).all()
            if comp and onedrive.graph_configured():
                excel_log.sync_company_excel(comp.code, cands)
        except Exception as e:  # noqa: BLE001
            print("excel sync failed", e)
        finally:
            s.close()
    threading.Thread(target=_go, daemon=True).start()


# ----------------------------- PUBLIC application form --------------------
@app.get("/apply/{company_code}", response_class=HTMLResponse)
def apply_page(company_code: str, request: Request, db: Session = Depends(get_db)):
    comp = db.query(Company).filter(Company.code == company_code.upper()).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    company = COMPANY_BY_CODE.get(comp.code, {"name": comp.name, "logo": "", "color": "#1273b8"})
    return templates.TemplateResponse(request, "apply.html", {
        "request": request, "company": {**company, "code": comp.code, "name": comp.name},
        "form_fields": load_form_fields(), "sources": SOURCES,
    })


@app.post("/api/apply/{company_code}")
async def apply_submit(company_code: str, request: Request, db: Session = Depends(get_db)):
    comp = db.query(Company).filter(Company.code == company_code.upper()).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    payload = await request.json()
    form_data = payload.get("form_data", {}) or {}
    source = payload.get("source", "Google Forms")
    for f in load_form_fields():
        if f.get("required") and not str(form_data.get(f["key"], "")).strip():
            raise HTTPException(status_code=400, detail=f"{f['label']} is required")
    c = _create_candidate(db, comp, source, form_data, created_via="public")
    db.add(StageHistory(candidate_id=c.id, from_stage=None, to_stage="applied",
                        note=f"Application received ({source})", changed_by_name="Public Form"))
    db.commit()
    fire(c.id)            # OneDrive PDF + Excel
    fire_notify(c.id)     # email HR about the new application
    return {"ok": True, "id": c.id}


# ----------------------------- user management ----------------------------
@app.get("/api/users")
def list_users(db: Session = Depends(get_db), admin: User = Depends(auth.require_super_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [{
        "id": u.id, "name": u.name, "email": u.email, "role": u.role,
        "company_code": u.company.code if u.company else None,
        "company_name": u.company.name if u.company else "All Companies",
        "is_active": u.is_active,
    } for u in users]


@app.post("/api/users")
def create_user(body: UserIn, db: Session = Depends(get_db),
                admin: User = Depends(auth.require_super_admin)):
    if not body.password:
        raise HTTPException(status_code=400, detail="Password required")
    if db.query(User).filter(func.lower(User.email) == body.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    company_id = None
    if body.role != "super_admin":
        comp = db.query(Company).filter(Company.code == body.company_code).first()
        if not comp:
            raise HTTPException(status_code=400, detail="Company required for HR users")
        company_id = comp.id
    u = User(email=body.email.lower(), name=body.name, role=body.role,
             company_id=company_id, password_hash=auth.hash_password(body.password))
    db.add(u)
    db.commit()
    return {"ok": True, "id": u.id}


@app.patch("/api/users/{uid}")
def update_user(uid: int, body: UserUpdateIn, db: Session = Depends(get_db),
                admin: User = Depends(auth.require_super_admin)):
    u = db.query(User).filter(User.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    if body.name is not None:
        u.name = body.name
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.role is not None:
        u.role = body.role
    if body.company_code is not None:
        if body.company_code == "" or body.role == "super_admin":
            u.company_id = None
        else:
            comp = db.query(Company).filter(Company.code == body.company_code).first()
            u.company_id = comp.id if comp else None
    if body.password:
        u.password_hash = auth.hash_password(body.password)
    db.commit()
    return {"ok": True}


@app.get("/healthz")
def health():
    return {"ok": True, "graph": onedrive.graph_configured(), "hr_notify": notify.notify_configured()}
