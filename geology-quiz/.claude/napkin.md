# Napkin

## Project
Research/notes for an English↔Chuukese (chk) retrieval-augmented in-context LLM translation app.

## Verified facts (2026-06)
- Chuukese chk: SUPPORTED by Google Translate (added 2024-06-27, 110-lang PaLM 2 batch).
- chk NOT supported by DeepL, NOT by Azure/Microsoft Translator, NOT in NLLB-200 / FLORES-200.
- No Micronesian language (chk/pon/mah/gil/yap/cha) is in NLLB-200/FLORES-200 or Azure. Azure Pacific coverage = only Samoan + Fijian.

## Key papers
- MTOB (Tanzer et al., arXiv 2309.16575, ICLR 2024): Kalamang one-book translation. LLM 44.7/45.8 chrF vs human 51.6/57.0.
- Aycock et al. "Can LLMs Really Learn...One Grammar Book?" (2409.19151): parallel sentences, not grammar prose, drive scores; vocab coverage predicts quality (p<0.005).
- Mambai RAG (2404.04809): ~5x BLEU gap manual vs native-speaker test set = overfitting warning.
- "Shortcomings..." (2406.15625, WMT 2024): Southern Quechua; grammar/corpus context can have NULL/NEGATIVE effect; morpheme translations help.

## Gotchas / corrections
- "Shortcomings of LLMs..." is about Quechua, not Kalamang. Don't conflate.
- Couldn't confirm exact models behind MTOB headline numbers from abstract alone — flagged low confidence.

## Parallel corpora for chk (verified 2026-06)
- BEST source: BibleNLP/ebible corpus (GitHub BibleNLP/ebible + HF dataset bible-nlp/biblenlp-corpus). chk IS included; verse-aligned via vref.txt → trivially aligns to any English Bible in same corpus. Source = ebible.org "Paipel" full Bible (OT+NT, ~31k verses).
- chk Bible license = CC BY-ND 4.0 (redistribute OK w/ attribution; NO derivatives changing words/punctuation — a tokenized verse-aligned copy is fine, paraphrasing is not). Copyright Liebenzell Mission (OT 1989/2001, NT 1984/1991); 2011 full Bible via Bible Society of Micronesia.
- OPUS has NO chk at all (opusapi {"corpora":[]} for chk and chk-en). JW300/MT560 effectively withdrawn over JW copyright — do NOT redistribute jw.org-derived data.
- chk NOT in NLLB-200/FLORES-200/CCMatrix. Tatoeba has ~0 chk (not in 430-lang stats list). Neither usable.
- jw.org has chk NWT Greek Scriptures (NT) released Oct 2023 + magazines, BUT jw.org ToS forbids TDM/redistribution. Operator-runtime only, copyrighted.
- Hawaii DOH Office of Language Access: chk COVID/health PDFs parallel to English — operator-collectable, not a clean corpus, gov-work license unclear.
- OPUS web result-table URLs 404; use opusapi/?source=chk&target=en JSON endpoint instead.

## Grammar/orthography (verified 2026-06, second pass)
- Dyen 1965 "A Sketch of Trukese Grammar" (AOS Essay 4, 60pp): NOT freely online. Only catalog/metadata (Google Books no-preview id=MjAaAQAAIAAJ, Open Library OL5939202M, Glottolog ref 103468, WALS, WorldCat oclc 654339700). ILL/purchase only. Do NOT attribute specifics to Dyen — we never read it.
- Standard orthography = Goodenough & Sugita (1980), online trussel2.com/TRK. Alphabet order: a á e é i o ó u ú f s k l m mw n ng p pw r ch t w y. Acute vowels added by linguists in 1970s. IPA per Wikipedia: a/ɐ/, á/a/, e/e/, é/ə/(schwa), i/i/, o/o/, ó/ɑ/, u/u/, ú/ɨ/ — but quality-vs-length mapping is medium-confidence (sources inconsistent).
- Digraphs: ch /ʈʂ/ (older "tr"), ng /ŋ/, mw /mˠ~mʷ/, pw /pˠ~pʷ/. Length: double vowels (waa); geminate consonants by doubling, incl. word-initial (ff ss kk mm mmw nng pp ppw tt).
- Pronouns/agreement (Hahm 2015 "Polite Plurals in Chuukese", afla22 PDF — best glossed source): incl/excl 1PL. Subject markers (proclitics) OBLIGATORY + pro-drop; object suffixes optional, can't co-occur w/ object NP. Plurals double as POLITE singulars.
- TAM by particles not inflection: future/irrealis -pwe; stative mii. No articles. Conjunction me ("and/with").
- Negation = fused negative subject-proclitic set (use/kose/ese..., future usap/.../esap). ese=NEG.3SG, esap=NEG.FUT.3SG. Medium confidence (Wiktionary, Bible-attested, not peer-reviewed).
- Possession (Micronesian hallmark): direct/inalienable (suffix on noun; construct/relational -n) vs. indirect/alienable (possessive classifier word + possessor suffix; general classifier aa-/yaa-, nei/néú). Exact chk classifier forms = lower confidence (some pulled from Mortlockese).
- Gloss labels to use: 1SG/3PL + clusivity 1PL.INCL/1PL.EXCL; SM (subject marker), OM (object marker); FUT/IRR (-pwe), STAT (mii); NEG / NEG.FUT; POSS, CONST (-n), CL.GEN/CL.EDIBLE/CL.DRINK/CL.VEH; POL (polite plural).
- CAUTION: Bilinguistics.com claims chk is "ergative" + "VSO" — likely WRONG (contradicts nominative SM/OM in Hahm). Disregard pending academic source.
