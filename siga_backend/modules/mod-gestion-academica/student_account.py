"""Creación automática de la cuenta institucional del estudiante (DNI@siga.edu).

Se invoca al registrar la matrícula. Usa SQL directo sobre las tablas core_*
(compartidas en la misma base) para no depender del gateway.
La contraseña inicial es el DNI del estudiante (bcrypt).
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger("mod-gestion-academica.student_account")

DOMINIO = "siga.edu"


def email_institucional_para(dni: str) -> str:
    return f"{str(dni).strip()}@{DOMINIO}"


def _hash(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def asegurar_cuenta_estudiante(db: AsyncSession, estudiante) -> dict:
    """Crea (si no existe) el usuario DNI@siga.edu con rol 'estudiante'.

    Devuelve {"email", "creada": bool}. Nunca lanza excepción: si algo falla,
    la matrícula ya registrada no se revierte.
    """
    dni = str(getattr(estudiante, "dni", "") or "").strip()
    if not dni:
        return {"email": None, "creada": False, "error": "Estudiante sin DNI"}
    email = email_institucional_para(dni)
    try:
        async with db.begin_nested():
            row = (await db.execute(text("SELECT id FROM core_users WHERE lower(email) = lower(:e)"), {"e": email})).first()
            creada = False
            if row:
                user_id = row[0]
            else:
                full_name = f"{getattr(estudiante, 'nombres', '') or ''} {getattr(estudiante, 'apellidos', '') or ''}".strip()
                user_id = (await db.execute(
                    text("""
                        INSERT INTO core_users (email, full_name, hashed_password, is_active, is_superuser, created_at)
                        VALUES (:e, :n, :h, TRUE, FALSE, now())
                        RETURNING id
                    """),
                    {"e": email, "n": full_name or email, "h": _hash(dni)},
                )).scalar_one()
                creada = True

            role = (await db.execute(text("SELECT id FROM core_roles WHERE name = 'estudiante'"))).first()
            if role is None:
                role_id = (await db.execute(text(
                    "INSERT INTO core_roles (name, description, created_at) VALUES ('estudiante', 'Estudiante Regular', now()) RETURNING id"
                ))).scalar_one()
            else:
                role_id = role[0]
            tiene = (await db.execute(
                text("SELECT 1 FROM core_user_roles WHERE user_id = :u AND role_id = :r"),
                {"u": user_id, "r": role_id},
            )).first()
            if not tiene:
                await db.execute(
                    text("INSERT INTO core_user_roles (user_id, role_id) VALUES (:u, :r)"),
                    {"u": user_id, "r": role_id},
                )

        # Correo institucional en la ficha del estudiante (si está libre)
        if not getattr(estudiante, "email_institucional", None):
            try:
                async with db.begin_nested():
                    ocupado = (await db.execute(
                        text("SELECT 1 FROM estudiantes WHERE lower(email_institucional) = lower(:e) AND id <> :id"),
                        {"e": email, "id": estudiante.id},
                    )).first()
                    if not ocupado:
                        estudiante.email_institucional = email
                        await db.flush()
            except Exception as exc:  # pragma: no cover
                log.warning("No se pudo asignar email_institucional a %s: %s", estudiante.id, exc)

        await db.commit()
        return {"email": email, "creada": creada}
    except Exception as exc:
        log.error("No se pudo crear la cuenta %s: %s", email, exc)
        try:
            await db.rollback()
        except Exception:
            pass
        return {"email": email, "creada": False, "error": str(exc)}
