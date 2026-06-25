import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from .models import Base

# Database path - stored in backend folder
DATABASE_URL = "sqlite:///./shop.db"

# SQLite engine configuration
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database - create all tables"""
    Base.metadata.create_all(bind=engine)
    print("✓ Database tables created successfully!")

def drop_all_tables():
    """Drop all tables (development only)"""
    Base.metadata.drop_all(bind=engine)
    print("✓ All tables dropped!")

def reset_db():
    """Reset database - drop and recreate all tables"""
    drop_all_tables()
    init_db()
    print("✓ Database reset complete!")
