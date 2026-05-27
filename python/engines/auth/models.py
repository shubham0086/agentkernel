import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    company_name = Column(String, unique=True, index=True, nullable=False)
    contact_person = Column(String)
    phone = Column(String, nullable=True)
    category = Column(String)
    source = Column(String)  # 'Reddit', 'IndiaMART', 'Google', etc.
    stage = Column(String, default="new")  # 'new', 'researched', 'contacted'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationships
    pitches = relationship("OutreachMessage", back_populates="lead", cascade="all, delete-orphan")

class OutreachMessage(Base):
    __tablename__ = "outreach_messages"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    channel = Column(String, default="whatsapp")  # 'whatsapp', 'email'
    message_text = Column(Text, nullable=False)
    status = Column(String, default="draft")  # 'draft', 'sent', 'failed'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationships
    lead = relationship("Lead", back_populates="pitches")
