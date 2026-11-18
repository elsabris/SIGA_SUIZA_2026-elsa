import os

try:
    import psycopg2 as psycopg
except ImportError:
    try:
        import psycopg
    except ImportError:
        raise ImportError("Se requiere psycopg o psycopg2 instalado.")

conn = psycopg.connect(
    host=os.getenv('DB_HOST', 'localhost'),
    port=int(os.getenv('DB_PORT', '5432')),
    user=os.getenv('DB_USER', 'postgres'),
    password=os.getenv('DB_PASSWORD', '61077615'),
    dbname=os.getenv('DB_NAME', 'siga_suiza_2026')
)
cur = conn.cursor()

print('=== VERIFICACION FINAL ===')
cur.execute("""
    SELECT 'core_users' AS tabla, COUNT(*) AS registros FROM core_users
    UNION ALL
    SELECT 'estudiantes', COUNT(*) FROM estudiantes
    UNION ALL
    SELECT 'programas_estudio', COUNT(*) FROM programas_estudio
    UNION ALL
    SELECT 'core_roles', COUNT(*) FROM core_roles
    UNION ALL
    SELECT 'core_permissions', COUNT(*) FROM core_permissions;
""")
for tabla, registros in cur.fetchall():
    print(f'  {tabla}: {registros}')

cur.close()
conn.close()