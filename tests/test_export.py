import io
import zipfile

from app.export import parse_blocks, parse_inline, render_docx, render_pdf

SAMPLE = """# Title here

*Generated today.*

## Section

- bullet with **bold** and [a link](https://example.org/x)
1. **First**: numbered item
2. Second item

Plain paragraph with an & ampersand and <angle> brackets.
"""


def test_parse_inline_finds_bold_italic_and_links():
    spans = parse_inline("a **b** *c* [d](http://e)")
    kinds = [k for k, _, _ in spans]
    assert kinds == ["plain", "bold", "plain", "italic", "plain", "link"]
    assert spans[-1] == ("link", "d", "http://e")


def test_parse_blocks_classifies_lines():
    kinds = [k for k, _ in parse_blocks(SAMPLE)]
    assert kinds == ["h1", "para", "h2", "bullet", "numbered", "numbered", "para"]


def test_pdf_is_a_valid_pdf_with_content():
    data = render_pdf("Title here", SAMPLE)
    assert data.startswith(b"%PDF")
    assert len(data) > 1500


def test_pdf_survives_non_latin_text_and_special_characters():
    # GDELT headlines can be in any script - must not crash the export.
    data = render_pdf("t", "# مرحبا 中文 & <b>\n- café — ok")
    assert data.startswith(b"%PDF")


def test_docx_is_a_valid_package_containing_text_and_hyperlink():
    data = render_docx("Title here", SAMPLE)
    z = zipfile.ZipFile(io.BytesIO(data))
    assert "word/document.xml" in z.namelist()
    xml = z.read("word/document.xml").decode("utf-8")
    assert "Title here" in xml
    assert "w:hyperlink" in xml
    assert "https://example.org/x" in z.read("word/_rels/document.xml.rels").decode("utf-8")

    from docx import Document

    text = "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)
    assert "numbered item" in text
    assert "& ampersand" in text
