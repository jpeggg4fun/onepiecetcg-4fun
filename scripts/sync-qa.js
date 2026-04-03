import fs from 'fs';
import path from 'path';

// Using file URL to string to handle paths properly in ES modules if needed,
// but we can just use new URL since type: module is enabled.
const __dirname = new URL('.', import.meta.url).pathname;

const htmlPath = path.resolve(__dirname, '../../optcg_qa_checklist.html');
const resultsPath = path.resolve(__dirname, '../test-results.json');

if (!fs.existsSync(resultsPath) || !fs.existsSync(htmlPath)) {
  console.log('Skipping sync: test results or HTML not found.');
  process.exit(0);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
let html = fs.readFileSync(htmlPath, 'utf8');

const passedIds = new Set();

if (results.testResults) {
  results.testResults.forEach(suite => {
    if (suite.assertionResults) {
      suite.assertionResults.forEach(a => {
        if (a.status === 'passed') {
           const match = a.title.match(/@qa:([A-Z]\d{2})/);
           const ancestorMatch = a.ancestorTitles.join(' ').match(/@qa:([A-Z]\d{2})/);
           if (match) passedIds.add(match[1]);
           if (ancestorMatch) passedIds.add(ancestorMatch[1]);
        }
      });
    }
  });
}

passedIds.forEach(id => {
  const pattern = new RegExp(`(<div class="qa-item )status-pending([^>]*data-id="${id}")`, 'g');
  html = html.replace(pattern, '$1status-ok$2');
});

fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`Synced passed QA items: ${Array.from(passedIds).join(', ')}`);
