# l0remizer+
This is a fork of [loremizer](https://github.com/chinchang/loremizer) by [@chinchang](https://github.com/chinchang) which I love as an extension but wanted to modernize and add a few updates to.

A browser extension to lorem ipsum-ize any web page.

## Why?

Say you want to take a screenshot of a web page, but it contains some sensitive information. Or maybe there is a long form you want to fill with dummy values. Run l0remizer+ on the page once and you are done!

## Features

- 🙃 Randomize text and numbers, keeping their shape: `@username` becomes `@suscipit`, `John SMITH` becomes `Modi ERROR`, `#00421` becomes `#00906`. A repeated name gets the same replacement across the page.
- 📊 Increase or decrease text length: below 1x drops words from the end, above 1x adds words, and words keep a realistic size either way. `Please confirm your shipping address` at 0.5x becomes `Veniam numquam anim`. Set a minimum or maximum word count to keep short labels or long passages at their real length. Words are counted per piece of text, so a sentence split by a link or bold word is judged in parts.
- ✍️ Use your own replacement words: paste any text, and its words replace the page's words. If your text has no word of a needed length, choose to bend your words to fit, fall back to lorem ipsum, or use the closest-length word.
- 🎯 Choose which parts change: list CSS selectors, one per line, under **Include** (such as `main`) or **Exclude** (such as `.site-header`). Class names copied straight from the page work too, even Tailwind ones like `.md:flex`.
- 💾 Every setting is remembered per site, as soon as you change it.
- 🔁 Not keen on the words you got? While active, ↻ swaps in a fresh set of replacements without deactivating.
- 🖼 Replace images with random photos from [picsum.photos](https://picsum.photos)
- ⚡️ Fill forms
- 〰 Convert text to scribble!

## Use cases

- Take a screenshot of a page that contains confidential information.
- Fill a form with dummy (but contextual) information.
- Test a design with shorter or longer text.
- Turn text into scribble so reviewers focus on layout, not copy.

## Development

Load the folder as an unpacked extension (Chrome) or a temporary add-on (Firefox 112 or later). The extension uses Manifest V3.

Run the tests with Node 20 or later:

```sh
npm test
```

## Privacy

l0remizer+ collects no data. It stores your settings in your browser and sends them nowhere.

**Small Warning:** Replace images loads photos from picsum.photos. That site sees your IP address, as it would for any image on the web. Replaced `<img>` tags send no referrer, so picsum.photos can't see which page you are on. Replaced CSS background images can't turn the referrer off. For those, picsum.photos may see the page's address. To send nothing, leave Replace images off.

## License

Released under the MIT License; see [LICENSE](LICENSE). Copyright 2018-2021 Kushagra Gour, 2026 z0mbieparade.

The Redacted fonts in `fonts/` are by Christian Naths, under the SIL Open Font License; see [fonts/OFL.txt](fonts/OFL.txt).
