# focus-kit-clinic

The guided project of *One Page at a Time*: a clinic scheduling app, built from an empty folder with [focus-kit](https://github.com/JCKodel/focus-kit), one tag per chapter.

## What this is

A neighbourhood clinic's scheduling app, with a customer side and an owner side.
The book builds it one delivery at a time, starting from this repository, which holds only this README and the licenses.

## The book

* The site: <https://jckodel.github.io/focus-kit-book/>
* Portuguese edition: <https://jckodel.github.io/focus-kit-book/pt/>

## Tags

* `book-v1/start` is the empty starting point, before chapter 5.
* A chapter that changes this project ends with the tag `book-v1/<chapter-slug>` on the commit it quotes: the chapter file `07-brainstorm.md` gives `book-v1/brainstorm`.
* A chapter that changes nothing has no tag; its exercises start from the latest earlier tag.
* A published tag never moves. A second edition of the book tags `book-v2/*`.

To follow a chapter, check out its tag, or the latest one before it:

```
git checkout book-v1/start
```

## Licenses

| What | License | File |
|---|---|---|
| Code, scripts, configuration | AGPL-3.0-only | [`LICENSE`](LICENSE) |
| `docs/`, `work/`, this README | CC BY-SA 4.0 | [`LICENSE-TEXT`](LICENSE-TEXT) |
| focus-kit's installed command files | AGPL-3.0-only, under focus-kit's own terms | [`LICENSE`](LICENSE) |
