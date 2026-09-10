import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

HOST = "192.168.1.190"
PORT = 5432
USER = "asmita"
PASSWORD = "asmita"
DB_NAME = "gmd_gem_ids"

def create_database_and_table():
    print(f"Connecting to PostgreSQL host {HOST}:{PORT} as user '{USER}'...")
    try:
        # Step 1: Connect to default 'postgres' database to check/create DB
        conn = psycopg2.connect(
            host=HOST,
            port=PORT,
            user=USER,
            password=PASSWORD,
            dbname="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database gmd_gem_ids exists
        cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s;", (DB_NAME,))
        exists = cursor.fetchone()
        
        if not exists:
            print(f"Database '{DB_NAME}' does not exist. Creating database '{DB_NAME}'...")
            cursor.execute(f'CREATE DATABASE "{DB_NAME}";')
            print(f"Database '{DB_NAME}' created successfully!")
        else:
            print(f"Database '{DB_NAME}' already exists.")
            
        cursor.close()
        conn.close()

        # Step 2: Connect to gmd_gem_ids database and create table gmd_gem_ids
        print(f"Connecting to database '{DB_NAME}'...")
        conn_target = psycopg2.connect(
            host=HOST,
            port=PORT,
            user=USER,
            password=PASSWORD,
            dbname=DB_NAME
        )
        cursor_target = conn_target.cursor()
        
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS gmd_gem_ids (
            id SERIAL PRIMARY KEY,
            gem_id VARCHAR(255) UNIQUE NOT NULL,
            drive_link TEXT,
            remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        print("Creating table 'gmd_gem_ids' if not exists...")
        cursor_target.execute(create_table_sql)
        conn_target.commit()
        print("Table 'gmd_gem_ids' created successfully in database 'gmd_gem_ids'!")
        
        cursor_target.close()
        conn_target.close()
        print("PostgreSQL setup completed cleanly!")
        
    except Exception as e:
        print(f"Error connecting/setting up PostgreSQL: {e}")
        sys.exit(1)

if __name__ == "__main__":
    create_database_and_table()
