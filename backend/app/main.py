"""Tutor Core API — точка входа."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import tutors, packages, students

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

# CORS для фронтенда админки и ЛК родителя
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tutors.router)
app.include_router(students.router)
app.include_router(packages.router)


@app.get("/health")
async def health():
    return {"status": "ok"}