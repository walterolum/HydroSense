"""
HydroSense AI Service — PostgreSQL Database Module
Replaces direct sqlite3 usage with psycopg2 PostgreSQL connections.

Usage:
    from pg_db import get_db, rows_to_dicts, DB
    conn = get_db()
    rows = conn.execute("SELECT * FROM users").fetchall()
    conn.close()
"""

import os
import re


try:
    import psycopg2
    import psycopg2.extras
    import psycopg2.pool
    HAS_PG = True
except ImportError:
    HAS_PG = False
    print("[PG_DB] psycopg2 not installed. Install with: pip install psycopg2-binary")


# ── Connection Configuration ─────────────────────────────────────────────
DB_CONFIG = {
    "host": os.getenv("PG_HOST", "localhost"),
    "port": int(os.getenv("PG_PORT", 5432)),
    "dbname": os.getenv("PG_DATABASE", "hydrosense"),
    "user": os.getenv("PG_USER", "hydrosense"),
    "password": os.getenv("PG_PASSWORD", "hydrosense"),
    "application_name": "hydrosense-ai",
}

DB_POOL_MIN = int(os.getenv("PG_POOL_MIN", "2"))
DB_POOL_MAX = int(os.getenv("PG_POOL_MAX", "10"))


# ── SQLite → PostgreSQL SQL Transformer ─────────────────────────────────
# Matches conversions done in server/db.js for consistency.

STRFTIME_MAP = {
    "%Y": "YYYY",
    "%m": "MM",
    "%d": "DD",
    "%H": "HH24",
    "%M": "MI",
    "%S": "SS",
    "%j": "DDD",
    "%W": "WW",
    "%w": "D",
}


def _convert_strftime(sqlite_fmt):
    pg_fmt = sqlite_fmt
    for s, p in STRFTIME_MAP.items():
        pg_fmt = pg_fmt.replace(s, p)
    return pg_fmt


def _convert_datetime_modifier(modifier):
    parts = modifier.strip().split()
    value = parts[0]
    unit = " ".join(parts[1:]) if len(parts) > 1 else "hours"
    sign = "-" if value.startswith("-") else "+"
    num = value.lstrip("+-")
    if not unit.endswith("s"):
        unit = unit + "s"
    return f"NOW() {sign} INTERVAL '{num} {unit}'"


def _convert_date_modifier(modifier):
    parts = modifier.strip().split()
    value = parts[0]
    unit = " ".join(parts[1:]) if len(parts) > 1 else "days"
    sign = "-" if value.startswith("-") else "+"
    num = value.lstrip("+-")
    if not unit.endswith("s"):
        unit = unit + "s"
    return f"(CURRENT_DATE {sign} INTERVAL '{num} {unit}')::date"


def transform_sql(sql):
    """Convert SQLite-specific SQL syntax to PostgreSQL equivalents."""
    s = sql

    # datetime(column) > datetime('now')
    s = re.sub(r"datetime\((\w+)\)\s*>=\s*datetime\('now'\)", r"\1 >= NOW()", s)
    s = re.sub(r"datetime\((\w+)\)\s*<=\s*datetime\('now'\)", r"\1 <= NOW()", s)
    s = re.sub(r"datetime\((\w+)\)\s*>\s*datetime\('now'\)", r"\1 > NOW()", s)
    s = re.sub(r"datetime\((\w+)\)\s*<\s*datetime\('now'\)", r"\1 < NOW()", s)

    # datetime('now', 'modifier')
    s = re.sub(
        r"datetime\('now',\s*'([^']+)'\)",
        lambda m: _convert_datetime_modifier(m.group(1)),
        s,
    )

    # datetime('now')
    s = re.sub(r"datetime\('now'\)", "NOW()", s)

    # date('now', 'modifier')
    s = re.sub(
        r"date\('now',\s*'([^']+)'\)",
        lambda m: _convert_date_modifier(m.group(1)),
        s,
    )

    # date('now')
    s = re.sub(r"date\('now'\)", "CURRENT_DATE", s)

    # strftime(format, column)
    s = re.sub(
        r"strftime\('([^']+)',\s*(\w+)\)",
        lambda m: f"to_char({m.group(2)}, '{_convert_strftime(m.group(1))}')",
        s,
    )

    # last_insert_rowid() → LASTVAL()
    s = s.replace("last_insert_rowid()", "LASTVAL()")

    return s


# ── Connection Pool (lru_cache pattern for simplicity) ───────────────────
_pool = None


def get_pool():
    """Get or create a simple connection pool using a list of connections."""
    global _pool
    if _pool is None:
        if not HAS_PG:
            return None
        _pool = psycopg2.pool.ThreadedConnectionPool(
            DB_POOL_MIN, DB_POOL_MAX, **DB_CONFIG
        )
        print(f"[PG_DB] Connection pool created ({DB_POOL_MIN}-{DB_POOL_MAX})")
    return _pool


class PGConnection:
    """
    Wraps a psycopg2 connection to provide:
    - Automatic SQLite → PostgreSQL SQL transformation
    - RealDictCursor for column-name access (row['column'])
    - Compatible .execute() interface with sqlite3
    
    Usage:
        conn = PGConnection()
        row = conn.execute("SELECT * FROM users WHERE id = %s", (1,)).fetchone()
        print(row['name'])  # dict-style access works
    """
    
    def __init__(self, conn):
        self.conn = conn
        self.autocommit = False
    
    def execute(self, sql, params=None):
        if params is None:
            params = ()
        transformed = transform_sql(sql)
        transformed = transformed.replace("?", "%s")
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(transformed, params)
        return cur
    
    def commit(self):
        self.conn.commit()
    
    def rollback(self):
        self.conn.rollback()
    
    def close(self):
        put_db(self.conn)
    
    def cursor(self):
        return self.conn.cursor()


def get_db():
    """
    Get a PostgreSQL connection wrapper.
    Replaces: conn = sqlite3.connect(DB_PATH)
    
    Returns a PGConnection wrapper with RealDictCursor and auto SQL transformation.
    Caller MUST close the connection with conn.close().
    
    For simple usage:
        conn = get_db()
        try:
            result = conn.execute(sql, params).fetchall()
            for row in result:
                print(row['column_name'])  # dict-style access
        finally:
            conn.close()
    """
    if not HAS_PG:
        raise RuntimeError(
            "psycopg2 is not installed. "
            "Run: pip install psycopg2-binary"
        )
    
    pool = get_pool()
    if pool:
        raw = pool.getconn()
    else:
        raw = psycopg2.connect(**DB_CONFIG)
    
    raw.autocommit = False
    return PGConnection(raw)


def put_db(conn):
    """Return a connection to the pool."""
    global _pool
    raw = conn.conn if isinstance(conn, PGConnection) else conn
    if _pool and raw:
        _pool.putconn(raw)
    elif raw:
        raw.close()


def close_pool():
    """Close all connections in the pool."""
    global _pool
    if _pool:
        _pool.closeall()
        _pool = None
        print("[PG_DB] Connection pool closed")


class DB:
    """
    Context manager for database connections.
    
    Usage:
        with DB() as conn:
            rows = conn.execute("SELECT * FROM users").fetchall()
            # conn is automatically returned to pool / closed
    """
    
    def __enter__(self):
        self.conn = get_db()
        return self.conn
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            if self.conn:
                self.conn.rollback()
        put_db(self.conn)
        return False


def rows_to_dicts(rows):
    """Convert RealDictRow results to plain dicts."""
    if rows is None:
        return []
    return [dict(r) for r in rows]


def execute(conn, sql, params=None):
    """
    Execute a SQL query with automatic SQLite-to-PostgreSQL transformation.
    
    Args:
        conn: psycopg2 connection or PGConnection wrapper
        sql: SQL string (may contain SQLite-specific syntax)
        params: tuple or list of parameters
    
    Returns:
        cursor with results (RealDictCursor)
    """
    if isinstance(conn, PGConnection):
        return conn.execute(sql, params)
    if params is None:
        params = ()
    transformed = transform_sql(sql)
    transformed = transformed.replace("?", "%s")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(transformed, params)
    return cur


def table_exists(conn, table_name):
    """Check if a table exists in PostgreSQL."""
    result = conn.execute(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = %s) AS exists",
        (table_name,),
    ).fetchone()
    return result['exists'] if result else False


def init_schema_if_needed(conn):
    """Create required AI tables if they don't exist (for backward compat)."""
    tables = {
        "ai_conversations": """
            CREATE TABLE IF NOT EXISTS ai_conversations (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'New Chat',
                user_id INTEGER REFERENCES users(id),
                role TEXT NOT NULL,
                district TEXT,
                category TEXT DEFAULT 'general',
                incident_id INTEGER,
                location_id INTEGER,
                is_multi_user INTEGER DEFAULT 0,
                participants TEXT,
                summary TEXT,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """,
        "ai_messages": """
            CREATE TABLE IF NOT EXISTS ai_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
                content TEXT NOT NULL,
                content_type TEXT DEFAULT 'text',
                file_url TEXT,
                file_type TEXT,
                file_name TEXT,
                file_size INTEGER,
                metadata TEXT,
                tokens_used INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """,
        "ai_decision_log": """
            CREATE TABLE IF NOT EXISTS ai_decision_log (
                id SERIAL PRIMARY KEY,
                decision_type TEXT NOT NULL,
                input_data TEXT,
                output_data TEXT,
                confidence_score DOUBLE PRECISION,
                user_id INTEGER REFERENCES users(id),
                role TEXT,
                district TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """,
        "notification_log": """
            CREATE TABLE IF NOT EXISTS notification_log (
                id SERIAL PRIMARY KEY,
                recipient_type TEXT NOT NULL,
                recipient_id INTEGER,
                recipient_contact TEXT,
                channel TEXT NOT NULL,
                subject TEXT,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                reference_type TEXT,
                reference_id INTEGER,
                sent_at TIMESTAMPTZ DEFAULT NOW(),
                delivered_at TIMESTAMPTZ
            )
        """,
        "_migrations": """
            CREATE TABLE IF NOT EXISTS _migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
        """,
    }
    
    for name, ddl in tables.items():
        if not table_exists(conn, name):
            try:
                conn.execute(ddl)
                conn.commit()
                print(f"[PG_DB] Created table: {name}")
            except Exception as e:
                conn.rollback()
                print(f"[PG_DB] Warning: Could not create {name}: {e}")
