from sqlalchemy.orm import Session
from . import models, auth

# --- User CRUD ---
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_id(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def create_user(db: Session, email: str, plain_password: str):
    hashed_pwd = auth.hash_password(plain_password)
    db_user = models.User(email=email, hashed_password=hashed_pwd)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- Lead CRUD ---
def get_lead_by_id(db: Session, lead_id: int):
    return db.query(models.Lead).filter(models.Lead.id == lead_id).first()

def get_lead_by_company(db: Session, company_name: str):
    return db.query(models.Lead).filter(models.Lead.company_name == company_name).first()

def list_leads(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Lead).offset(skip).limit(limit).all()

def create_lead(db: Session, name: str, company_name: str, contact_person: str = "", phone: str = "", category: str = "", source: str = "custom"):
    # Check duplicate
    existing = get_lead_by_company(db, company_name)
    if existing:
        return existing
        
    db_lead = models.Lead(
        name=name,
        company_name=company_name,
        contact_person=contact_person,
        phone=phone,
        category=category,
        source=source,
        stage="new"
    )
    db.add(db_lead)
    db.commit()
    db.refresh(db_lead)
    return db_lead

def update_lead_stage(db: Session, lead_id: int, stage: str):
    db_lead = get_lead_by_id(db, lead_id)
    if db_lead:
        db_lead.stage = stage
        db.commit()
        db.refresh(db_lead)
    return db_lead

# --- OutreachMessage CRUD ---
def create_outreach_message(db: Session, lead_id: int, message_text: str, channel: str = "whatsapp"):
    db_msg = models.OutreachMessage(
        lead_id=lead_id,
        channel=channel,
        message_text=message_text,
        status="draft"
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg

def list_outreach_messages(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.OutreachMessage).offset(skip).limit(limit).all()
