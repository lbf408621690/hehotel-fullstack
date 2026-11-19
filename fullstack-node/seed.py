# -*- coding: utf-8 -*-
"""
把 D:/project/hotel/hotel.sql (MySQL dump) 迁移为 SQLite 数据库 data/hotel.db。
解析 CREATE TABLE 建表结构 + INSERT 数据，转换为 SQLite 语法。
"""
import re, sqlite3, os

SRC = r"D:/project/hotel/hotel.sql"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "hotel.db")

# 表列定义（从 MySQL 建表语句提取，转成 SQLite 类型）
TABLES = {
    "check_in": ["check_in_id INTEGER PRIMARY KEY AUTOINCREMENT", "order_id INTEGER", "room_id INTEGER",
                 "room_number TEXT", "peo_count INTEGER DEFAULT 1", "persons TEXT", "ids TEXT",
                 "check_in_time TEXT", "check_out_time TEXT", "create_time TEXT", "update_time TEXT"],
    "hotel_info": ["hotel_id INTEGER PRIMARY KEY AUTOINCREMENT", "hotel_name TEXT", "phone TEXT",
                   "telephone TEXT", "email TEXT", "address TEXT", "website TEXT",
                   "create_time TEXT", "update_time TEXT"],
    "order_info": ["order_id INTEGER PRIMARY KEY AUTOINCREMENT", "order_type_id INTEGER DEFAULT 2",
                   "order_type TEXT", "user_id INTEGER DEFAULT 0", "name TEXT", "phone TEXT",
                   "room_type_id INTEGER", "room_type TEXT", "order_date TEXT", "order_days INTEGER DEFAULT 1",
                   "order_status INTEGER DEFAULT 0", "order_cost REAL", "create_time TEXT", "update_time TEXT"],
    "order_type": ["type_id INTEGER PRIMARY KEY AUTOINCREMENT", "type TEXT", "remark TEXT",
                   "create_time TEXT", "update_time TEXT"],
    "room_info": ["room_id INTEGER PRIMARY KEY AUTOINCREMENT", "room_number TEXT UNIQUE", "type_id INTEGER",
                  "room_type TEXT", "room_price REAL DEFAULT 0", "room_discount REAL DEFAULT 0",
                  "room_status INTEGER DEFAULT 1", "remark TEXT", "create_time TEXT", "update_time TEXT"],
    "room_type": ["type_id INTEGER PRIMARY KEY AUTOINCREMENT", "room_type TEXT UNIQUE", "remark TEXT",
                  "price REAL DEFAULT 0", "discount REAL", "area INTEGER DEFAULT 12", "bed_num INTEGER DEFAULT 1",
                  "bed_size TEXT DEFAULT '1.5m*1.8m'", "window INTEGER DEFAULT 0", "rest INTEGER DEFAULT 0",
                  "create_time TEXT", "update_time TEXT"],
    "user_info": ["user_id INTEGER PRIMARY KEY AUTOINCREMENT", "username TEXT UNIQUE DEFAULT ''",
                  "password TEXT DEFAULT ''", "name TEXT", "gender TEXT DEFAULT '男'", "phone TEXT UNIQUE",
                  "email TEXT", "address TEXT", "idcard TEXT", "create_time TEXT", "update_time TEXT"],
    "worker_info": ["worker_id INTEGER PRIMARY KEY AUTOINCREMENT", "role TEXT DEFAULT 'operator'",
                    "username TEXT UNIQUE", "password TEXT", "name TEXT", "gender TEXT DEFAULT '男'",
                    "phone TEXT", "email TEXT", "address TEXT", "create_time TEXT", "update_time TEXT"],
}

# MySQL 表名 -> INSERT 语句里的表名（一致）
SQL_TABLE_TO_KEY = {k: k for k in TABLES}

def clean_date(s):
    """把 MySQL 的 0000-00-00 日期置空"""
    if s and s.startswith("0000-00-00"):
        return ""
    return s

def split_sql_values(line):
    """解析 INSERT INTO `t` VALUES (...); 中的值列表，支持逗号分隔和引号转义"""
    m = re.match(r"INSERT INTO `?(\w+)`? VALUES\s*\((.*)\);\s*$", line.strip())
    if not m:
        return None, None
    table, body = m.group(1), m.group(2)
    vals, cur, in_str, i = [], "", False, 0
    while i < len(body):
        ch = body[i]
        if ch == "'":
            if in_str and i + 1 < len(body) and body[i + 1] == "'":
                cur += "'"; i += 2; continue
            in_str = not in_str; cur += "'"
        elif ch == "," and not in_str:
            vals.append(cur.strip()); cur = ""
        else:
            cur += ch
        i += 1
    vals.append(cur.strip())
    return table, vals

def unquote(v):
    v = v.strip()
    if v.upper() == "NULL":
        return None
    if v.startswith("'") and v.endswith("'"):
        s = v[1:-1].replace("''", "'")
        return clean_date(s)
    return v  # 数字保持字符串，交给 sqlite 转换

def main():
    if os.path.exists(OUT):
        os.remove(OUT)
    conn = sqlite3.connect(OUT)
    c = conn.cursor()
    for name, cols in TABLES.items():
        c.execute("CREATE TABLE %s (%s)" % (name, ", ".join(cols)))
    counts = {k: 0 for k in TABLES}
    with open(SRC, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line.startswith("INSERT INTO"):
                continue
            table, vals = split_sql_values(line)
            if not table or table not in TABLES or vals is None:
                continue
            ncols = len(TABLES[table])
            if len(vals) != ncols:
                print("跳过列数不匹配:", table, len(vals), ncols); continue
            vals = [unquote(v) for v in vals]
            ph = ",".join("?" * ncols)
            c.execute("INSERT INTO %s VALUES (%s)" % (table, ph), vals)
            counts[table] += 1
    conn.commit()
    conn.close()
    print("已生成:", OUT)
    print("导入统计:", counts)

if __name__ == "__main__":
    main()
