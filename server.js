import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);
const app = express();
const PORT = 8080;

app.use(express.json());

app.post('/validate', async (req, res) => {
  let inputFile = null;
  let outputFile = null;

  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        valid: false,
        error: 'Missing required field: code'
      });
    }

    // Create temp directory and files
    const tempDir = join(tmpdir(), 'mermaid-validation');
    await mkdir(tempDir, { recursive: true });

    const id = randomBytes(8).toString('hex');
    inputFile = join(tempDir, `${id}.mmd`);
    outputFile = join(tempDir, `${id}.svg`);

    // Write mermaid code to temp file
    await writeFile(inputFile, code);

    try {
      // Try to render the diagram with mmdc from @mermaid-js/mermaid-cli
      const { stderr } = await execAsync(
        `./node_modules/.bin/mmdc -i "${inputFile}" -o "${outputFile}" -p puppeteer-config.json`,
        { timeout: 10000 }
      );

      return res.json({
        valid: true,
        error: null
      });
    } catch (error) {
      // Parse error message from mmdc output
      const errorMessage = error.stderr || error.message || 'Invalid Mermaid diagram';

      return res.status(400).json({
        valid: false,
        error: errorMessage.split('\n').find(line =>
          line.includes('Error') || line.includes('error') || line.includes('Parse')
        ) || errorMessage,
        details: errorMessage
      });
    }
  } catch (error) {
    return res.status(500).json({
      valid: false,
      error: 'Internal server error',
      details: error.message
    });
  } finally {
    // Cleanup temp files
    try {
      if (inputFile) await unlink(inputFile).catch(() => {});
      if (outputFile) await unlink(outputFile).catch(() => {});
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mermaid validation service running on port ${PORT}`);
});
