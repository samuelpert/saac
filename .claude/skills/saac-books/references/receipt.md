# Book receipt

Contents: purpose, layout, where each value comes from, rules, open points.

The book receipt is the paper record of what a person borrowed in a term. It is printed from the app, signed at the desk, and kept on paper, so the desk can keep working when the system is down. The layout below comes from the receipt layout PDF SAAC approved. The printed title stays `SAAC Book Receipt`; it is not renamed. Every example and test uses fake data, never a real name or PID.

## 1. Purpose

One receipt per person per term, for people who borrow books. It lists each book grouped by class, with the dates, two pairs of initials and dates (received and returned) for every book, and the signed Book Return Agreement. It is the paper record staff check returned books against. Holds cover books and technology, so both this receipt and the tech agreement (D4) are the papers checked when building the hold list.

## 2. Layout

Letter paper, portrait.

1. Header band in FIU gold. The title `SAAC Book Receipt` in FIU blue on the left, and the term on the right, for example `SUMMER 2026`.
2. Info strip with `SPORT`, `PID`, and `NAME`, and a barcode of the PID at the right with the PID digits under it.
3. Column headings: `TRANS. NO.`, `ISBN`, `ITEM NAME`, `ED.`, `BOOKSTORE`.
4. One block per class, in class order:
   - A class band, for example `CLASS: COP 3530`.
   - For each book in that class, a row with the transaction number, the ISBN or bookstore code, the item name, the edition, and a checkbox under `BOOKSTORE`.
   - Under the row, `CHECKED OUT` with the date and `DUE DATE` with the date. The due date is red and bold, so it still stands out on a black and white printer.
   - Under that, two paired blanks. On the left `RECEIVED BY STUDENT` with Initial and Date. On the right `RETURNED TO SAAC` with Initial and Date.
5. After the last class, the heading `Book Return Agreement`, the agreement as a bullet list, then two signature lines: `Check Out Signature` with Date, and `Return Signature` with Date.
6. Footer: the print date on the left and `Page 1 of 1` on the right.

A long list continues onto more pages. Keep each class block together on one page, and keep the agreement and signature lines together on the last page.

## 3. Where each value comes from

| Field | Source |
| --- | --- |
| Term | The term code, shown as `SUMMER 2026` |
| Sport | The person's team, or their kind (staff, graduate assistant) when they have no team |
| PID, name | The person record |
| Barcode | The PID. The symbology is decided in the barcode step |
| Trans. no. | A short number for that loan line, shown on paper. The schema needs a unique sequential loan number on `BookLoan` for this. Add it when phase 4 is built |
| ISBN | The title's ISBN, or the bookstore code when the list has no real ISBN |
| Item name | The title name exactly as the bookstore list gives it |
| Ed. | The edition when the list has one, blank otherwise |
| Class band | The class the need came from |
| Checked out, due date | The loan dates. The due date defaults from the term's return deadline unless an admin overrides it with a reason |
| Bookstore checkbox | See open point 1 |

## 4. Rules

- The receipt shows only what is printed above. No email, phone, or scholarship status.
- The agreement wording belongs to SAAC and can change, so it is editable text in settings and never hardcoded. A reprinted receipt shows the wording it was first printed with, so store the wording version on the receipt.
- One page for a typical person. Reprinting any receipt is a feature (H2).
- The agreement says returns are due no later than three business days after the last official University final exam, which is how the term's return deadline is defined. It also says students are financially responsible for lost or misplaced books and technology and that unreturned items lead to a hold on the student account. That supports keeping the optional charge amount (G4) and the `CHARGED` stage.

## 5. Open points

1. What does the `BOOKSTORE` checkbox mean? Likely it marks a book that came from the bookstore rather than from SAAC's own shelf, which the agreement says is also returned to SAAC. Confirm before building.
2. The sample's ISBN values do not look like standard ISBNs, which start with 978 or 979. The item names look like bookstore course codes with the instructor and term. If the real Barnes & Noble list does the same, Open Library lookup by ISBN will not find those lines, and matching must use the bookstore code and the class. Check this against the real list (open question 6).
3. The sample shows books only. Is the tech agreement (D4) a separate printout, or does tech appear on this receipt?
