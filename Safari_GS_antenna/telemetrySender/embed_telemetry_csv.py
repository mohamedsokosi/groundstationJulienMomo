from pathlib import Path

Import("env")

PROJECT_DIR = Path(env.subst("$PROJECT_DIR"))
CSV_PATH = PROJECT_DIR / "src" / "telemetry.csv"
HEADER_PATH = PROJECT_DIR / "include" / "telemetry_csv.h"


def c_string_literal(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def generate_header():
    lines = CSV_PATH.read_text(encoding="utf-8-sig").splitlines()
    line_literals = ",\n".join(f"  {c_string_literal(line)}" for line in lines)
    content = (
        "#pragma once\n"
        "\n"
        "#include <stddef.h>\n"
        "\n"
        "// Generated from src/telemetry.csv by embed_telemetry_csv.py.\n"
        "static const char *const TELEMETRY_LINES[] = {\n"
        f"{line_literals}\n"
        "};\n"
        "\n"
        "static const size_t TELEMETRY_LINE_COUNT = "
        "sizeof(TELEMETRY_LINES) / sizeof(TELEMETRY_LINES[0]);\n"
    )

    HEADER_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not HEADER_PATH.exists() or HEADER_PATH.read_text(encoding="utf-8") != content:
        HEADER_PATH.write_text(content, encoding="utf-8", newline="\n")


generate_header()
