# Friday Night Rewind MVP

A mobile-first lead-generation website for a Central Florida sports-footage digitization, restoration, highlight-editing, and community storytelling business.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To verify the production version:

```bash
npm run build
npm run preview
```

## Deploy to Netlify

1. Push this folder to a Git repository.
2. In Netlify, choose **Add new site → Import an existing project**.
3. Select the repository.
4. Use `npm run build` as the build command and `dist` as the publish directory. `netlify.toml` already supplies these values and the SPA redirect.
5. Deploy, add the final domain, and replace `https://www.example.com` in `src/config.js`, `public/robots.txt`, and `public/sitemap.xml`.
6. Enable Netlify Forms or connect the form provider described below, then test every form on the deployed domain.

## Edit the business details

Most frequently changed business content lives in `src/config.js`:

- `site.name`: business name
- `site.tagline`: tagline
- `site.email` and `site.phone`: contact details
- `site.hours`: business hours
- `site.domain`: production domain
- `site.serviceArea`: cities and service-area statement
- `site.socials`: social URLs
- `services`: descriptions and starting prices
- `faqs`: questions and conservative answers

Page-specific long-form copy and forms live in `src/App.jsx`. Search for `PLACEHOLDER`, `example.com`, and `555` before launch.

## Replace the visual placeholders

The home-page before/after comparison is the `BeforeAfter` component in `src/App.jsx`. It intentionally uses a CSS-only placeholder, so it contains no unlicensed team, league, school, athlete, or broadcast material.

When a customer approves a real comparison:

1. Obtain explicit written permission covering website and promotional use.
2. Export short, muted, compressed MP4/WebM clips with matching framing and duration.
3. Add captions or visible labels identifying **Original** and **Restored**.
4. Add poster images and descriptive alt text or adjacent text.
5. Avoid autoplay with sound, and preserve controls/keyboard access.
6. State what was done and repeat that results vary by source.

## Form submissions and uploads

The MVP validates required fields and shows an in-browser confirmation. It does not yet transmit customer data or upload files. Before launch, choose one workflow:

- **Netlify Forms + email notifications:** simplest early lead capture. Confirm React-generated forms are detected in the deployed build, or add static HTML form definitions.
- **Google Sheets:** send validated form data through Make, Zapier, or a small serverless function. Do not expose private API credentials in browser code.
- **CRM:** connect HubSpot, Airtable, or another CRM through a serverless endpoint with consent and retention rules.
- **File delivery:** begin with a private Google Drive Upload Request or Dropbox File Request. For a more integrated experience, evaluate Uploadcare, Cloudinary, or a secure form-upload provider.

Do not accept large video files through ordinary email. Document access control, retention, deletion, malware scanning, maximum file size, allowed formats, and who can see submitted material before enabling uploads.

## Content, accessibility, and SEO

- Route metadata is in the `metas` object in `src/App.jsx`.
- The sitemap and robots files contain a placeholder production domain.
- All fields have visible labels; required fields use native validation.
- The site includes a skip link, keyboard-operable navigation and FAQ controls, reduced-motion support, responsive layouts, and high-contrast colors.
- Verify with Lighthouse, axe, real keyboard navigation, and at least one screen reader before launch.

## First 10 things to do before launch

1. Confirm the final business name and search Florida business records, domain availability, trademarks, and social handles with qualified professional help where needed.
2. Choose the legal business structure, register required state/local details, and open separate business banking.
3. Obtain suitable insurance and have an attorney review the customer agreement, releases, privacy policy, shipping risk, copyright process, and limitation-of-liability language.
4. Test the complete capture/restoration workflow on at least five tape conditions and document what can and cannot be improved.
5. Finalize accepted formats, drop-off/shipping rules, turnaround ranges, archive retention, tape return, damaged-media handling, and cancellation/refund terms.
6. Replace placeholder email, phone, hours, domain, and social links, then configure domain email.
7. Choose a secure upload/transfer provider and write a clear data-retention and deletion policy before collecting footage.
8. Connect forms to email, a spreadsheet, or CRM; add spam protection; and test success/failure notifications on mobile.
9. Produce customer-approved before/after samples and obtain verified testimonials without altering or exaggerating them.
10. Run accessibility, performance, browser, device, local SEO, form, analytics-consent, sitemap, and backup/recovery checks before announcing the launch.

## Important launch note

The current contact information, domain, business hours, social links, testimonials, and imagery are intentionally marked placeholders. No payment system is connected. Public posting should occur only after the required authorization is recorded.
