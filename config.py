"""
Central configuration for the Group ATS.
"""
import os
import json
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- core ---
    SECRET_KEY: str = "change-me-in-prod"
    DATABASE_URL: str = "sqlite:///./ats.db"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 12
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # --- Microsoft Graph / OneDrive (app-only client credentials) ---
    GRAPH_TENANT_ID: str = ""
    GRAPH_CLIENT_ID: str = ""
    GRAPH_CLIENT_SECRET: str = ""
    GRAPH_DRIVE_USER: str = "info@bharatsteels.in"   # OneDrive owner used for storage
    ATS_ROOT_FOLDER: str = "ATS"

    # --- HR email notification on new application (via Graph sendMail) ---
    HR_NOTIFY_EMAIL: str = "hr@bharatsteels.in"      # comma-separate for multiple recipients
    GRAPH_SENDER: str = "hr@bharatsteels.in"         # mailbox the notification is sent FROM

    # --- bootstrap super admin (created by scripts/init_db.py) ---
    SUPER_ADMIN_EMAIL: str = "info@bharatsteels.in"
    SUPER_ADMIN_PASSWORD: str = "ChangeMe@123"
    SUPER_ADMIN_NAME: str = "Group Admin"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ---------------------------------------------------------------------------
# COMPANIES  — add G2 Steel here later and it flows everywhere automatically.
# ---------------------------------------------------------------------------
COMPANIES = [
    {"code": "BSC",     "name": "Bharat Steel (Chennai) Pvt. Ltd.", "logo": "BSC.png",     "color": "#1273b8"},
    {"code": "METFRAA", "name": "Metfraa Steel Buildings Pvt. Ltd.", "logo": "Metfraa.png", "color": "#2b6cb0"},
    {"code": "CRAYON",  "name": "Crayon Roofings & Structures",      "logo": "CRS.png",     "color": "#3d5a73"},
]
COMPANY_BY_CODE = {c["code"]: c for c in COMPANIES}


# ---------------------------------------------------------------------------
# APPLICATION SOURCES
# ---------------------------------------------------------------------------
SOURCES = ["LinkedIn", "Naukri", "Indeed", "Google Forms", "Walk-in", "Referral", "Other"]


# ---------------------------------------------------------------------------
# PIPELINE STATE MACHINE
# ---------------------------------------------------------------------------
PIPELINE = [
    {
        "key": "applied", "label": "Application Received", "order": 1, "type": "active",
        "actions": [
            {"to": "screening", "label": "Move to Screening", "style": "primary"},
            {"to": "rejected_screening", "label": "Reject", "style": "danger"},
        ],
    },
    {
        "key": "screening", "label": "Screening", "order": 2, "type": "active",
        "actions": [
            {"to": "interest_check", "label": "Selected → Confirm Interest", "style": "primary"},
            {"to": "rejected_screening", "label": "Not Selected", "style": "danger"},
        ],
    },
    {
        "key": "interest_check", "label": "Interest Confirmation", "order": 3, "type": "active",
        "actions": [
            {"to": "interview_scheduled", "label": "Interested → Schedule Interview", "style": "primary", "needs": "interview"},
            {"to": "not_interested", "label": "Not Interested", "style": "danger"},
        ],
    },
    {
        "key": "interview_scheduled", "label": "Interview Scheduled", "order": 4, "type": "active",
        "actions": [
            {"to": "interview_completed", "label": "Mark Interview Done", "style": "primary"},
            {"to": "interview_scheduled", "label": "Reschedule", "style": "secondary", "needs": "interview"},
            {"to": "rejected_interview", "label": "Reject", "style": "danger"},
        ],
    },
    {
        "key": "interview_completed", "label": "Interview Completed", "order": 5, "type": "active",
        "actions": [
            {"to": "offer", "label": "Result: Selected → Offer", "style": "primary"},
            {"to": "rejected_interview", "label": "Result: Rejected", "style": "danger"},
        ],
    },
    {
        "key": "offer", "label": "Offer / Joining", "order": 6, "type": "active",
        "actions": [
            {"to": "joined", "label": "Joining → set DOJ", "style": "success", "needs": "joining"},
            {"to": "not_joined", "label": "Not Joining", "style": "danger"},
        ],
    },
    {"key": "joined",             "label": "Joined",                "order": 7,  "type": "won",  "actions": []},
    {"key": "rejected_screening", "label": "Rejected (Screening)",  "order": 98, "type": "lost", "actions": [{"to": "applied", "label": "Reopen", "style": "secondary"}]},
    {"key": "not_interested",     "label": "Not Interested",        "order": 98, "type": "lost", "actions": [{"to": "interest_check", "label": "Reopen", "style": "secondary"}]},
    {"key": "rejected_interview", "label": "Rejected (Interview)",  "order": 98, "type": "lost", "actions": [{"to": "interview_completed", "label": "Reopen", "style": "secondary"}]},
    {"key": "not_joined",         "label": "Did Not Join",          "order": 99, "type": "lost", "actions": [{"to": "offer", "label": "Reopen", "style": "secondary"}]},
]
STAGE_BY_KEY = {s["key"]: s for s in PIPELINE}
ACTIVE_STAGES = [s["key"] for s in PIPELINE if s["type"] == "active"]


def load_form_fields():
    path = os.path.join(os.path.dirname(__file__), "form_fields.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
