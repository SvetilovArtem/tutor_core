import sqlite3
import glob

# Скрипт найдет все .db файлы в папке backend и очистит в них таблицу версий alembic
db_files = glob.glob("*.db")

if not db_files:
    print("❌ Файлы .db не найдены. Убедитесь, что вы находитесь в папке backend.")
else:
    for db_file in db_files:
        print(f"Проверка базы данных: {db_file}")
        try:
            conn = sqlite3.connect(db_file)
            cursor = conn.cursor()
            # Проверяем, существует ли таблица alembic_version
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version';")
            if cursor.fetchone():
                cursor.execute("DELETE FROM alembic_version")
                conn.commit()
                print(f"✅ Успешно очищена таблица alembic_version в файле {db_file}")
            else:
                print(f"⚠️ Таблица alembic_version не найдена в {db_file}")
            conn.close()
        except Exception as e:
            print(f"❌ Ошибка при обработке {db_file}: {e}")