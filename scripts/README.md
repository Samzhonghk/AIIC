Excel -> sqlite 导入脚本

概览
-----
这个脚本把 Excel (.xlsx) 表格导入到项目的 sqlite 数据库（默认 db.sqlite）。设计原则是安全优先：默认是 dry-run（不写入 DB），并在真正写入前备份数据库。

依赖
-----
安装 Python 依赖（建议在虚拟环境中）：

```powershell
python -m pip install -r .\scripts\requirements.txt
```

快速示例
---------
1) 仅预览（dry-run，默认）：

```powershell
python .\scripts\import_excel.py --excel .\data.xlsx --sheet Sheet1 --table clients
```

2) 真正写入（先备份 db.sqlite，再插入）：

```powershell
python .\scripts\import_excel.py --excel .\data.xlsx --sheet Sheet1 --table clients --commit
```

3) 使用映射文件（mapping.json 指定 Excel 列到 DB 列的映射）：

```powershell
python .\scripts\import_excel.py --excel .\data.xlsx --sheet Sheet1 --mapping .\scripts\mapping.json --commit
```

Mapping JSON 示例（可选）
-----------------------
文件内容示例：

```json
{
  "table": "clients",
  "columns": {
    "客户编号": "client_number",
    "姓名": "name",
    "电话": "phone"
  }
}
```

高级选项
--------
- --truncate: 在插入前清空目标表（仅在 --commit 时有效）
- --date-cols "Due Date,Created": 指定 excel 中的列名，把它们转换为 unix 秒（整型）后写入 DB
- --batch N: 指定批量提交大小（默认 500）
- --skip-errors: 出现插入错误时跳过有问题的行（会降低原子性，请谨慎）

注意事项与建议
---------------
- 脚本会根据表结构（PRAGMA table_info）去匹配列名。若自动匹配失败，请提供 mapping 文件。
- 始终在生产环境写入前备份数据库。
- 如果表中有外键或复杂约束，建议先在测试环境跑一次并检查数据格式（日期、数值的单位、null 值等）。
- 若你希望把日期以字符串形式保存，别使用 --date-cols；若你需要 unix 时间戳请使用 --date-cols 指定列。

故障排查
--------
- 如果 Python 报错找不到 pandas/openpyxl，请运行：

```powershell
python -m pip install pandas openpyxl
```

- 如果脚本提示没有匹配列，请检查 Excel 表头是否与数据库列名一致，或创建 mapping.json 映射列名。

帮助
----
如需我为你生成一个针对你那张 Excel 的 mapping.json（我会先查看 Excel 的列头），把 Excel 的前几行（或列头）贴来，我可以为你生成 mapping 文件和一次示例的命令行。
