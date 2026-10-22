import { spawn as spawnImport, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { glbToGltf as glbToGltfImport } from 'gltf-pipeline';
import { UsdzConversionService } from './usdz-conversion.service';

// Only mock the narrow surface the service actually calls — deliberately
// NOT mocking node:fs itself, since that shadows the real node:fs/promises
// calls (mkdtemp/writeFile/rm/readFile) the service also depends on and
// silently breaks them.
jest.mock('gltf-pipeline', () => ({
  glbToGltf: jest.fn(),
}));
jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

const glbToGltf = jest.mocked(glbToGltfImport);
const spawn = jest.mocked(spawnImport);

/** Minimal fake child process: no real python involved. */
class FakeChild extends EventEmitter {
  stderr = new EventEmitter();
  kill = jest.fn();
}

function asChildProcess(child: FakeChild): ChildProcess {
  return child as unknown as ChildProcess;
}

async function buildService(
  config: Record<string, string | undefined> = {},
): Promise<UsdzConversionService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UsdzConversionService,
      {
        provide: ConfigService,
        useValue: { get: jest.fn((key: string) => config[key]) },
      },
    ],
  }).compile();
  return moduleRef.get(UsdzConversionService);
}

describe('UsdzConversionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    glbToGltf.mockResolvedValue({ gltf: { asset: { version: '2.0' } } });
  });

  describe('isAvailable', () => {
    let workDir: string;

    beforeEach(async () => {
      workDir = await mkdtemp(join(tmpdir(), 'usdz-available-test-'));
    });

    afterEach(async () => {
      await rm(workDir, { recursive: true, force: true });
    });

    it('is true when both the configured python binary and converter script exist', async () => {
      const pythonBin = join(workDir, 'python3');
      const script = join(workDir, 'gltf_to_usdz.py');
      await writeFile(pythonBin, '');
      await writeFile(script, '');

      const service = await buildService({
        USDZ_PYTHON_BIN: pythonBin,
        USDZ_CONVERTER_SCRIPT: script,
      });
      expect(service.isAvailable()).toBe(true);
    });

    it('is false when the converter script is missing', async () => {
      const pythonBin = join(workDir, 'python3');
      await writeFile(pythonBin, '');

      const service = await buildService({
        USDZ_PYTHON_BIN: pythonBin,
        USDZ_CONVERTER_SCRIPT: join(workDir, 'does-not-exist.py'),
      });
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('convert', () => {
    it('unpacks the GLB via gltf-pipeline, then resolves with the usdz produced by the converter script', async () => {
      const service = await buildService();
      const child = new FakeChild();
      spawn.mockImplementation((_cmd, args) => {
        const argv = args as string[];
        const usdzPath = argv[argv.indexOf('--output') + 1];
        // React to the real args instead of guessing timing: write the
        // "converter output" only once the service has told us where.
        void writeFile(usdzPath, 'fake-usdz-bytes').then(() =>
          child.emit('close', 0),
        );
        return asChildProcess(child);
      });

      const result = await service.convert(Buffer.from('fake-glb'));

      expect(result.toString()).toBe('fake-usdz-bytes');
      expect(glbToGltf).toHaveBeenCalledWith(Buffer.from('fake-glb'));
    });

    it('rejects with the exit code when the converter script fails', async () => {
      const service = await buildService();
      const child = new FakeChild();
      spawn.mockImplementation(() => {
        queueMicrotask(() => {
          child.stderr.emit('data', Buffer.from('Traceback...'));
          child.emit('close', 1);
        });
        return asChildProcess(child);
      });

      await expect(service.convert(Buffer.from('fake-glb'))).rejects.toThrow(
        'USDZ conversion failed (exit code 1)',
      );
    });

    it('rejects if the process itself fails to spawn', async () => {
      const service = await buildService();
      const child = new FakeChild();
      spawn.mockImplementation(() => {
        queueMicrotask(() => child.emit('error', new Error('ENOENT')));
        return asChildProcess(child);
      });

      await expect(service.convert(Buffer.from('fake-glb'))).rejects.toThrow(
        'ENOENT',
      );
    });
  });
});
