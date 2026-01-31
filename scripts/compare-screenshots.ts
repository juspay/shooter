#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// ============================================================================
// Type Definitions
// ============================================================================

interface ColorDiff {
  avgRedDiff: number;
  avgGreenDiff: number;
  avgBlueDiff: number;
  avgTotalDiff: number;
}

interface ComparisonResult {
  breakpoint: string;
  page: string;
  originalPath?: string;
  newPath?: string;
  diffPath?: string;
  width?: number;
  height?: number;
  totalPixels?: number;
  diffPixels: number;
  diffPercentage: number;
  colorDiff?: ColorDiff;
  significantChange?: boolean;
  error?: string;
  originalSize?: string;
  newSize?: string;
}

interface PixelmatchOptions {
  threshold: number;
  includeAA: boolean;
  alpha: number;
  diffColor: [number, number, number];
  diffColorAlt: [number, number, number];
}

// ============================================================================
// Constants
// ============================================================================

const SCREENSHOTS_DIR: string = path.join(process.cwd(), 'screenshots');
const ORIGINAL_DIR: string = SCREENSHOTS_DIR;
const NEW_DIR: string = path.join(SCREENSHOTS_DIR, 'after-semantic-migration');
const OUTPUT_DIR: string = path.join(SCREENSHOTS_DIR, 'comparison-output');
const DIFF_DIR: string = path.join(OUTPUT_DIR, 'diffs');

const BREAKPOINTS: readonly string[] = ['mobile', 'tablet', 'laptop', 'desktop'] as const;
const PAGES: readonly string[] = [
  'analytics',
  'config',
  'dashboard',
  'homepage',
  'integrations-claude',
  'integrations',
  'notifications-settings',
  'notifications',
  'system-monitoring-admin',
  'system-monitoring-config',
  'system-monitoring-debug',
  'system-monitoring'
] as const;

// ============================================================================
// Directory Setup
// ============================================================================

// Create output directories
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(DIFF_DIR)) {
  fs.mkdirSync(DIFF_DIR, { recursive: true });
}

// ============================================================================
// Image Processing Functions
// ============================================================================

/**
 * Load PNG image from file path
 * @param filePath - Path to the PNG file
 * @returns Promise resolving to PNG instance
 */
function loadImage(filePath: string): Promise<PNG> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream
      .pipe(new PNG())
      .on('parsed', function(this: PNG) {
        resolve(this);
      })
      .on('error', reject);
  });
}

/**
 * Save PNG image to file path
 * @param img - PNG instance to save
 * @param filePath - Destination file path
 * @returns Promise resolving when save is complete
 */
function saveImage(img: PNG, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const buffer: Buffer = PNG.sync.write(img);
    fs.writeFile(filePath, buffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Compare two images and return detailed statistics
 * @param originalPath - Path to original image
 * @param newPath - Path to new image
 * @param diffPath - Path to save difference heatmap
 * @param breakpoint - Responsive breakpoint name
 * @param page - Page name
 * @returns Promise resolving to comparison result
 */
async function compareImages(
  originalPath: string,
  newPath: string,
  diffPath: string,
  breakpoint: string,
  page: string
): Promise<ComparisonResult> {
  try {
    const img1: PNG = await loadImage(originalPath);
    const img2: PNG = await loadImage(newPath);

    // Ensure images have same dimensions
    if (img1.width !== img2.width || img1.height !== img2.height) {
      console.warn(`⚠️  Dimension mismatch for ${breakpoint}/${page}: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`);
      return {
        breakpoint,
        page,
        error: 'Dimension mismatch',
        originalSize: `${img1.width}x${img1.height}`,
        newSize: `${img2.width}x${img2.height}`,
        diffPixels: 0,
        diffPercentage: 0,
        totalPixels: img1.width * img1.height
      };
    }

    const { width, height } = img1;
    const diff: PNG = new PNG({ width, height });

    // Compare images with pixelmatch
    const options: PixelmatchOptions = {
      threshold: 0.1,
      includeAA: true,
      alpha: 0.1,
      diffColor: [255, 0, 0],
      diffColorAlt: [255, 128, 0]
    };

    const diffPixels: number = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      options
    );

    // Save diff image
    await saveImage(diff, diffPath);

    const totalPixels: number = width * height;
    const diffPercentage: number = (diffPixels / totalPixels) * 100;

    // Analyze color differences
    const colorDiff: ColorDiff = analyzeColorDifferences(img1, img2);

    return {
      breakpoint,
      page,
      originalPath,
      newPath,
      diffPath,
      width,
      height,
      totalPixels,
      diffPixels,
      diffPercentage,
      colorDiff,
      significantChange: diffPercentage > 10
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error comparing ${breakpoint}/${page}:`, errorMessage);
    return {
      breakpoint,
      page,
      error: errorMessage,
      diffPixels: 0,
      diffPercentage: 0
    };
  }
}

/**
 * Analyze color differences between two images
 * @param img1 - First PNG image
 * @param img2 - Second PNG image
 * @returns Color difference statistics
 */
function analyzeColorDifferences(img1: PNG, img2: PNG): ColorDiff {
  let totalRedDiff = 0;
  let totalGreenDiff = 0;
  let totalBlueDiff = 0;
  let pixelCount = 0;

  for (let i = 0; i < img1.data.length; i += 4) {
    const r1: number = img1.data[i];
    const g1: number = img1.data[i + 1];
    const b1: number = img1.data[i + 2];

    const r2: number = img2.data[i];
    const g2: number = img2.data[i + 1];
    const b2: number = img2.data[i + 2];

    totalRedDiff += Math.abs(r1 - r2);
    totalGreenDiff += Math.abs(g1 - g2);
    totalBlueDiff += Math.abs(b1 - b2);
    pixelCount++;
  }

  return {
    avgRedDiff: totalRedDiff / pixelCount,
    avgGreenDiff: totalGreenDiff / pixelCount,
    avgBlueDiff: totalBlueDiff / pixelCount,
    avgTotalDiff: (totalRedDiff + totalGreenDiff + totalBlueDiff) / (pixelCount * 3)
  };
}

// ============================================================================
// Report Generation Functions
// ============================================================================

/**
 * Generate interactive HTML report with visual comparisons
 * @param results - Array of comparison results
 * @returns HTML string
 */
function generateHTMLReport(results: ComparisonResult[]): string {
  const sortedResults: ComparisonResult[] = results
    .filter(r => !r.error)
    .sort((a, b) => b.diffPercentage - a.diffPercentage);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Screenshot Comparison Report - Semantic Color Migration</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    .header p {
      font-size: 1.1rem;
      opacity: 0.9;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }
    .summary {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .summary h2 {
      margin-bottom: 1rem;
      color: #667eea;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 1.5rem;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 0.5rem;
    }
    .stat-label {
      color: #666;
      font-size: 0.9rem;
    }
    .top-changes {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .top-changes h2 {
      margin-bottom: 1rem;
      color: #667eea;
    }
    .top-changes ol {
      list-style-position: inside;
      padding-left: 1rem;
    }
    .top-changes li {
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .change-major {
      border-left: 4px solid #dc3545;
    }
    .change-moderate {
      border-left: 4px solid #ffc107;
    }
    .change-minor {
      border-left: 4px solid #28a745;
    }
    .comparison {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .comparison-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #f0f0f0;
    }
    .comparison-title {
      font-size: 1.5rem;
      color: #333;
    }
    .comparison-badge {
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-weight: bold;
      font-size: 0.9rem;
    }
    .badge-major {
      background: #dc3545;
      color: white;
    }
    .badge-moderate {
      background: #ffc107;
      color: #333;
    }
    .badge-minor {
      background: #28a745;
      color: white;
    }
    .image-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .image-container {
      text-align: center;
    }
    .image-container h3 {
      font-size: 1rem;
      margin-bottom: 0.5rem;
      color: #666;
    }
    .image-container img {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metrics {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 8px;
      margin-top: 1rem;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }
    .metric {
      text-align: center;
    }
    .metric-value {
      font-size: 1.2rem;
      font-weight: bold;
      color: #667eea;
    }
    .metric-label {
      font-size: 0.85rem;
      color: #666;
    }
    .breakpoint-section {
      margin-bottom: 3rem;
    }
    .breakpoint-title {
      font-size: 1.8rem;
      color: #667eea;
      margin-bottom: 1.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 3px solid #667eea;
    }
    @media (max-width: 768px) {
      .image-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📸 Screenshot Comparison Report</h1>
    <p>Semantic Color Token Migration - Visual Impact Analysis</p>
  </div>

  <div class="container">
    <div class="summary">
      <h2>📊 Overall Statistics</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${results.length}</div>
          <div class="stat-label">Total Comparisons</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${results.filter(r => r.significantChange).length}</div>
          <div class="stat-label">Major Changes (&gt;10%)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${(results.reduce((sum, r) => sum + (r.diffPercentage || 0), 0) / results.length).toFixed(2)}%</div>
          <div class="stat-label">Average Difference</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${Math.max(...results.map(r => r.diffPercentage || 0)).toFixed(2)}%</div>
          <div class="stat-label">Max Difference</div>
        </div>
      </div>
    </div>

    <div class="top-changes">
      <h2>🏆 Top 10 Most Changed Pages</h2>
      <ol>
        ${sortedResults.slice(0, 10).map(r => `
          <li class="${r.diffPercentage > 10 ? 'change-major' : r.diffPercentage > 5 ? 'change-moderate' : 'change-minor'}">
            <strong>${r.page}</strong> (${r.breakpoint}) - <strong>${r.diffPercentage.toFixed(2)}%</strong> difference
          </li>
        `).join('')}
      </ol>
    </div>

    ${BREAKPOINTS.map(breakpoint => `
      <div class="breakpoint-section">
        <h2 class="breakpoint-title">📱 ${breakpoint.charAt(0).toUpperCase() + breakpoint.slice(1)} Screenshots</h2>
        ${sortedResults
          .filter(r => r.breakpoint === breakpoint)
          .map(result => `
            <div class="comparison">
              <div class="comparison-header">
                <div class="comparison-title">${result.page}</div>
                <div class="comparison-badge ${result.diffPercentage > 10 ? 'badge-major' : result.diffPercentage > 5 ? 'badge-moderate' : 'badge-minor'}">
                  ${result.diffPercentage.toFixed(2)}% different
                </div>
              </div>
              <div class="image-grid">
                <div class="image-container">
                  <h3>Original</h3>
                  <img src="../${path.relative(OUTPUT_DIR, result.originalPath!)}" alt="Original">
                </div>
                <div class="image-container">
                  <h3>After Migration</h3>
                  <img src="../${path.relative(OUTPUT_DIR, result.newPath!)}" alt="After Migration">
                </div>
                <div class="image-container">
                  <h3>Difference Heatmap</h3>
                  <img src="${path.relative(OUTPUT_DIR, result.diffPath!)}" alt="Difference">
                </div>
              </div>
              <div class="metrics">
                <div class="metrics-grid">
                  <div class="metric">
                    <div class="metric-value">${result.width}x${result.height}</div>
                    <div class="metric-label">Dimensions</div>
                  </div>
                  <div class="metric">
                    <div class="metric-value">${result.diffPixels.toLocaleString()}</div>
                    <div class="metric-label">Different Pixels</div>
                  </div>
                  <div class="metric">
                    <div class="metric-value">${result.colorDiff?.avgTotalDiff.toFixed(2)}</div>
                    <div class="metric-label">Avg Color Diff</div>
                  </div>
                  <div class="metric">
                    <div class="metric-value">${result.colorDiff?.avgRedDiff.toFixed(2)}</div>
                    <div class="metric-label">Red Channel</div>
                  </div>
                  <div class="metric">
                    <div class="metric-value">${result.colorDiff?.avgGreenDiff.toFixed(2)}</div>
                    <div class="metric-label">Green Channel</div>
                  </div>
                  <div class="metric">
                    <div class="metric-value">${result.colorDiff?.avgBlueDiff.toFixed(2)}</div>
                    <div class="metric-label">Blue Channel</div>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
      </div>
    `).join('')}
  </div>
</body>
</html>`;

  return html;
}

/**
 * Generate detailed Markdown summary report
 * @param results - Array of comparison results
 * @returns Markdown string
 */
function generateMarkdownSummary(results: ComparisonResult[]): string {
  const sortedResults: ComparisonResult[] = results
    .filter(r => !r.error)
    .sort((a, b) => b.diffPercentage - a.diffPercentage);

  const majorChanges = sortedResults.filter(r => r.diffPercentage > 10);
  const moderateChanges = sortedResults.filter(r => r.diffPercentage > 5 && r.diffPercentage <= 10);
  const minorChanges = sortedResults.filter(r => r.diffPercentage <= 5);

  const avgDiff: number = results.reduce((sum, r) => sum + (r.diffPercentage || 0), 0) / results.length;
  const maxDiff: number = Math.max(...results.map(r => r.diffPercentage || 0));

  const md = `# Visual Gaps Analysis - Semantic Color Migration

## Executive Summary

This report analyzes the visual impact of migrating from direct color values to semantic color tokens across all pages and breakpoints in the Shooter dashboard.

### Overall Impact

- **Total Comparisons**: ${results.length} (12 pages × 4 breakpoints)
- **Average Difference**: ${avgDiff.toFixed(2)}%
- **Maximum Difference**: ${maxDiff.toFixed(2)}%
- **Major Changes (>10%)**: ${majorChanges.length}
- **Moderate Changes (5-10%)**: ${moderateChanges.length}
- **Minor Changes (<5%)**: ${minorChanges.length}

## Key Findings

### 1. Top 10 Most Changed Pages

${sortedResults.slice(0, 10).map((r, i) => `${i + 1}. **${r.page}** (${r.breakpoint}) - **${r.diffPercentage.toFixed(2)}%** difference
   - Dimensions: ${r.width}×${r.height}
   - Different Pixels: ${r.diffPixels.toLocaleString()} / ${r.totalPixels?.toLocaleString()}
   - Avg Color Diff: ${r.colorDiff?.avgTotalDiff.toFixed(2)}
`).join('\n')}

### 2. Changes by Breakpoint

${BREAKPOINTS.map(breakpoint => {
  const breakpointResults = sortedResults.filter(r => r.breakpoint === breakpoint);
  const avgBreakpointDiff = breakpointResults.reduce((sum, r) => sum + r.diffPercentage, 0) / breakpointResults.length;
  return `#### ${breakpoint.charAt(0).toUpperCase() + breakpoint.slice(1)}
- Average Difference: ${avgBreakpointDiff.toFixed(2)}%
- Major Changes: ${breakpointResults.filter(r => r.diffPercentage > 10).length}
- Top Changed Page: ${breakpointResults[0]?.page} (${breakpointResults[0]?.diffPercentage.toFixed(2)}%)
`;
}).join('\n')}

### 3. Changes by Page

${PAGES.map(page => {
  const pageResults = sortedResults.filter(r => r.page === page);
  const avgPageDiff = pageResults.reduce((sum, r) => sum + r.diffPercentage, 0) / pageResults.length;
  return `#### ${page}
- Average Difference: ${avgPageDiff.toFixed(2)}%
- Breakpoint Differences:
${pageResults.map(r => `  - ${r.breakpoint}: ${r.diffPercentage.toFixed(2)}%`).join('\n')}
`;
}).join('\n')}

## Major Changes Analysis (>10% difference)

${majorChanges.length === 0 ? '✅ No pages have major visual changes exceeding 10%.' :
majorChanges.map(r => `### ${r.page} (${r.breakpoint})

- **Difference**: ${r.diffPercentage.toFixed(2)}%
- **Changed Pixels**: ${r.diffPixels.toLocaleString()} out of ${r.totalPixels?.toLocaleString()}
- **Color Impact**:
  - Red Channel: ${r.colorDiff?.avgRedDiff.toFixed(2)}
  - Green Channel: ${r.colorDiff?.avgGreenDiff.toFixed(2)}
  - Blue Channel: ${r.colorDiff?.avgBlueDiff.toFixed(2)}
  - Overall: ${r.colorDiff?.avgTotalDiff.toFixed(2)}

`).join('\n')}

## Recommendations

${majorChanges.length > 0 ? `
### 🔴 Critical Issues
${majorChanges.length} page(s) show significant visual changes (>10%). These require immediate review:
${majorChanges.map(r => `- ${r.page} (${r.breakpoint}): ${r.diffPercentage.toFixed(2)}%`).join('\n')}
` : ''}

${moderateChanges.length > 0 ? `
### 🟡 Moderate Changes
${moderateChanges.length} page(s) show moderate visual changes (5-10%). Review recommended:
${moderateChanges.map(r => `- ${r.page} (${r.breakpoint}): ${r.diffPercentage.toFixed(2)}%`).join('\n')}
` : ''}

${minorChanges.length === results.length ? `
### ✅ All Clear
All pages show minimal visual changes (<5%), indicating successful semantic token migration with maintained visual consistency.
` : ''}

## Color Analysis Insights

${sortedResults.length > 0 ? `The average color differences across channels provide insight into the nature of changes:

- **Red Channel**: ${(sortedResults.reduce((sum, r) => sum + (r.colorDiff?.avgRedDiff || 0), 0) / sortedResults.length).toFixed(2)} avg difference
- **Green Channel**: ${(sortedResults.reduce((sum, r) => sum + (r.colorDiff?.avgGreenDiff || 0), 0) / sortedResults.length).toFixed(2)} avg difference
- **Blue Channel**: ${(sortedResults.reduce((sum, r) => sum + (r.colorDiff?.avgBlueDiff || 0), 0) / sortedResults.length).toFixed(2)} avg difference` : 'No color analysis available (dimension mismatches or errors).'}

## Next Steps

1. **Review HTML Report**: Open \`screenshots/comparison-output/visual-comparison-report.html\` for detailed visual comparisons
2. **Examine Diff Images**: Check \`screenshots/comparison-output/diffs/\` for heatmaps of changed areas
3. **Investigate Major Changes**: Focus on pages with >10% difference to identify root causes
4. **Validate Intentional Changes**: Confirm that observed differences align with migration goals
5. **Update Documentation**: Document any expected visual changes from semantic token migration

---

*Generated on ${new Date().toISOString()}*
*Comparison Tool: pixelmatch with 0.1 threshold*
`;

  return md;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Main execution function - orchestrates the screenshot comparison process
 */
async function main(): Promise<void> {
  console.log('🚀 Starting screenshot comparison...\n');

  const results: ComparisonResult[] = [];
  let completed = 0;
  const total: number = BREAKPOINTS.length * PAGES.length;

  for (const breakpoint of BREAKPOINTS) {
    for (const page of PAGES) {
      const originalPath: string = path.join(ORIGINAL_DIR, breakpoint, `${page}.png`);
      const newPath: string = path.join(NEW_DIR, breakpoint, `${page}.png`);
      const diffPath: string = path.join(DIFF_DIR, `${breakpoint}-${page}-diff.png`);

      if (!fs.existsSync(originalPath)) {
        console.warn(`⚠️  Original not found: ${breakpoint}/${page}`);
        continue;
      }
      if (!fs.existsSync(newPath)) {
        console.warn(`⚠️  New screenshot not found: ${breakpoint}/${page}`);
        continue;
      }

      const result: ComparisonResult = await compareImages(originalPath, newPath, diffPath, breakpoint, page);
      results.push(result);

      completed++;
      const progress: string = ((completed / total) * 100).toFixed(1);
      console.log(`[${progress}%] Compared ${breakpoint}/${page}: ${result.diffPercentage?.toFixed(2) || 'ERROR'}% different`);
    }
  }

  console.log('\n✅ Comparison complete!\n');

  // Generate reports
  console.log('📝 Generating HTML report...');
  const html: string = generateHTMLReport(results);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'visual-comparison-report.html'), html);
  console.log(`   Saved to: ${path.join(OUTPUT_DIR, 'visual-comparison-report.html')}\n`);

  console.log('📝 Generating Markdown summary...');
  const markdown: string = generateMarkdownSummary(results);
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'VISUAL-GAPS-ANALYSIS.md'), markdown);
  console.log(`   Saved to: ${path.join(SCREENSHOTS_DIR, 'VISUAL-GAPS-ANALYSIS.md')}\n`);

  // Save raw results as JSON for further analysis
  console.log('💾 Saving raw results...');
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'comparison-results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(`   Saved to: ${path.join(OUTPUT_DIR, 'comparison-results.json')}\n`);

  // Print summary
  const majorChanges: ComparisonResult[] = results.filter(r => r.significantChange);
  const avgDiff: number = results.reduce((sum, r) => sum + (r.diffPercentage || 0), 0) / results.length;

  console.log('📊 Summary:');
  console.log(`   Total comparisons: ${results.length}`);
  console.log(`   Average difference: ${avgDiff.toFixed(2)}%`);
  console.log(`   Major changes (>10%): ${majorChanges.length}`);
  console.log(`   Max difference: ${Math.max(...results.map(r => r.diffPercentage || 0)).toFixed(2)}%`);

  if (majorChanges.length > 0) {
    console.log('\n⚠️  Pages with major changes:');
    majorChanges.forEach(r => {
      console.log(`   - ${r.breakpoint}/${r.page}: ${r.diffPercentage.toFixed(2)}%`);
    });
  }

  console.log('\n🎉 Done! Open the HTML report to see detailed comparisons.');
}

main().catch(console.error);
