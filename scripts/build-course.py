"""Build the static corpus and search index from the revised 001–031 DOCX."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET
from zipfile import ZipFile

WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
TERMS = """
回头克 回头生 暗动 日冲 日破 月破 旬空 空亡 日辰 日建 月建 月令
世爻 应爻 官鬼 子孙 兄弟 父母 妻财 六亲 六神 用神 忌神 原神 元神
动爻 静爻 变爻 伏神 飞神 伏藏 出伏 三合 三冲 六合 六冲 反吟 伏吟
入墓 墓库 化墓 化绝 化空 化破 化进 化退 进神 退神 旺相 休囚 旺衰
纳甲 卦宫 游魂 归魂 卦身 卦象 阴阳 五行 地支 天干 刑冲 生克
占病 病神 射覆 应期 起卦 问病 持世 持官鬼 寻物
""".split()
CJK = re.compile(r"[\u3400-\u9fff]+")
CHAPTER = re.compile(r"^(?:第\s*)?(0\d{2})(?:\s*课)?\s+(.+)$")
COURSE_ID = re.compile(r"\b(?:00[1-9]|0[12]\d|03[01])\b")
ADDITIONS = {
    "静卦": ["029"], "填实": ["010"], "出伏": ["013", "031"],
    "独发": ["012", "017"], "提携": ["013", "031"], "飞伏": ["013", "031"],
    "冲空": ["029", "030"], "自到": ["010"], "合绊": ["028", "030"],
    "化用": ["015", "031"], "飞生伏": ["031"], "飞克伏": ["013", "031"],
    "伏克飞": ["013"], "特殊衰败": ["030", "031"], "间爻": ["013", "031"],
    "老阴": ["001", "023"], "老阳": ["001", "023"], "少阴": ["001", "023"],
    "少阳": ["001", "023"], "动爻相连": ["012"], "持应": ["009", "010"],
    "日临": ["028", "030"], "月临": ["028", "030"], "旺相": ["028", "031"],
    "用旺世兴": ["011", "029"], "辨旺衰": ["011"], "象法": ["011", "013"],
    "理法": ["011", "013"], "生合": ["012", "013"], "克合": ["012", "028"],
    "月合": ["028", "030", "031"], "日合": ["028", "031"],
    "用神持世": ["029"], "忌神持世": ["029"], "用神生世": ["029"],
    "用神克世": ["029"], "三刑": ["012", "018", "028"], "动卦": ["030"],
    "八纯卦": ["002", "013", "022"], "寻宫诀": ["002", "006", "007"],
    "本宫卦": ["002", "022"], "归魂卦": ["002", "022"], "冲破": ["011", "029"],
    "神兆机于动": ["013", "022"], "观测点": ["011", "028"], "动变": ["011", "030"],
    "联动": ["019", "030", "031"], "合局": ["013", "031"],
}


def read_glossary(path, lessons):
    glossary = {}
    standard_table = unicodedata.normalize("NFKC", path.read_text(encoding="utf-8-sig")).split("## (b)", 1)[0]
    for line in standard_table.splitlines():
        if not line.startswith("|"):
            continue
        term, _, reference = (cell.strip() for cell in line.strip("|").split("|"))
        course_ids = list(dict.fromkeys(COURSE_ID.findall(reference)))
        if course_ids:
            labels = re.split(r"[/()]", term)
            for label in filter(None, (part.strip() for part in labels)):
                glossary[label] = course_ids
    if len(glossary) < 40:
        raise ValueError("无法读取术语总表中的标准写法表")
    for term in TERMS:
        glossary.setdefault(term, [])
    for term, courses in ADDITIONS.items():
        glossary[term] = list(dict.fromkeys([*glossary.get(term, []), *courses]))
    course_texts = {
        lesson: [unicodedata.normalize("NFKC", p) for p in source["paragraphs"]]
        for lesson, source in lessons.items()
    }
    output = {}
    for term, primary in glossary.items():
        counts = {lesson: sum(p.count(term) for p in paragraphs)
                  for lesson, paragraphs in course_texts.items()}
        output[term] = {"lessons": primary, "count": sum(counts.values())}
    return output


def read_lessons(path):
    with ZipFile(path) as document:
        root = ET.fromstring(document.read("word/document.xml"))
    lessons = {}
    current = None
    for paragraph in root.find(WORD + "body").iter(WORD + "p"):
        parts = []
        for node in paragraph.iter():
            if node.tag == WORD + "t":
                parts.append(node.text or "")
            elif node.tag == WORD + "tab":
                parts.append("\t")
            elif node.tag in (WORD + "br", WORD + "cr"):
                parts.append("\n")
        text = "".join(parts).strip()
        if not text:
            continue
        style = paragraph.find(f"{WORD}pPr/{WORD}pStyle")
        if style is not None and style.get(WORD + "val") == "Heading1":
            match = CHAPTER.fullmatch(text)
            if not match:
                raise ValueError(f"无法识别课次标题：{text}")
            lesson, title = match.groups()
            if lesson in lessons:
                raise ValueError(f"重复课次：{lesson}")
            current = {"title": title, "paragraphs": []}
            lessons[lesson] = current
        elif current is not None:
            current["paragraphs"].append(text)
    if list(lessons) != [f"{n:03d}" for n in range(1, 32)]:
        raise ValueError("课程必须按顺序包含第 001–031 课")
    return lessons


def block_ranges(paragraphs):
    start = 0
    count = 0
    for idx, paragraph in enumerate(paragraphs):
        if len(paragraph) > 1000:
            raise ValueError(f"第 {idx + 1} 段超过 1000 字，请核对语料版本")
        if idx > start and (count >= 800 or count + len(paragraph) + 1 > 1000):
            yield start, idx, count
            start, count = idx, 0
        count += len(paragraph) + (idx > start)
    if count:
        yield start, len(paragraphs), count


def build(lessons):
    blocks = []
    postings = defaultdict(list)
    for lesson, source in lessons.items():
        paragraphs = source["paragraphs"]
        for start, end, count in block_ranges(paragraphs):
            text = "\n".join(paragraphs[start:end])
            normalized = unicodedata.normalize("NFKC", text)
            grams = Counter(
                word[i:i + 2] for word in CJK.findall(normalized)
                for i in range(len(word) - 1)
            )
            keys = [term for term in TERMS if term in normalized]
            index = len(blocks)
            for gram, hits in grams.items():
                postings[gram].extend((index, hits))
            blocks.append(dict(lesson=lesson, start=start, end=end, size=count, keys=keys))
    return dict(lessons=lessons, blocks=blocks, postings=postings, terms=TERMS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docx", type=Path)
    parser.add_argument("--glossary", type=Path, help="Muse 的六爻课程术语总表 Markdown")
    arg = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    lessons = read_lessons(arg.docx)
    corpus = build(lessons)
    if arg.glossary:
        terms = read_glossary(arg.glossary, lessons)
        lines = [f"  {json.dumps(term, ensure_ascii=False)}: {json.dumps(data, ensure_ascii=False)}"
                 for term, data in terms.items()]
        output = "{\n" + ",\n".join(lines) + "\n}\n"
        (root / "src" / "course-glossary.json").write_text(output, encoding="utf-8")
        print(f"{len(terms)} merged course terms")
    raw = json.dumps(corpus, ensure_ascii=False, separators=(",", ":")).encode()
    version = sha256(raw).hexdigest()[:16]
    content = dict(version=version, **corpus)
    out = root / "public" / "course"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{version}.json").write_text(
        json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (root / "src" / "course-manifest.json").write_text(
        json.dumps({"version": version}, indent=2) + "\n", encoding="utf-8"
    )
    paragraphs = sum(len(source["paragraphs"]) for source in corpus["lessons"].values())
    print(f"{len(corpus['lessons'])} lessons, {paragraphs} paragraphs, {len(corpus['blocks'])} blocks, version {version}")


if __name__ == "__main__":
    main()
