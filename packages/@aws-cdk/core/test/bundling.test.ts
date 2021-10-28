import * as child_process from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import { describeDeprecated } from '@aws-cdk/cdk-build-tools';
import * as sinon from 'sinon';
import { DockerImage, FileSystem } from '../lib';

// describeDeprecated() is required because of this bug - https://github.com/aws/jsii/issues/3102
describeDeprecated('bundling', () => {
  afterEach(() => {
    sinon.restore();

  });

  test('bundling with image from registry', () => {
    sinon.stub(process, 'platform').value('darwin');
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    const image = DockerImage.fromRegistry('alpine');
    image.run({
      command: ['cool', 'command'],
      environment: {
        VAR1: 'value1',
        VAR2: 'value2',
      },
      volumes: [{ hostPath: '/host-path', containerPath: '/container-path' }],
      workingDirectory: '/working-directory',
      user: 'user:group',
    });

    expect(spawnSyncStub.calledWith('docker', [
      'run', '--rm',
      '-u', 'user:group',
      '-v', '/host-path:/container-path:delegated',
      '--env', 'VAR1=value1',
      '--env', 'VAR2=value2',
      '-w', '/working-directory',
      'alpine',
      'cool', 'command',
    ], { stdio: ['ignore', process.stderr, 'inherit'] })).toEqual(true);

  });

  test('bundling with image from asset', () => {
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    const imageHash = '123456abcdef';
    const fingerprintStub = sinon.stub(FileSystem, 'fingerprint');
    fingerprintStub.callsFake(() => imageHash);

    const image = DockerImage.fromBuild('docker-path', {
      buildArgs: {
        TEST_ARG: 'cdk-test',
      },
    });
    image.run();

    const tagHash = crypto.createHash('sha256').update(JSON.stringify({
      path: 'docker-path',
      buildArgs: {
        TEST_ARG: 'cdk-test',
      },
    })).digest('hex');
    const tag = `cdk-${tagHash}`;

    expect(spawnSyncStub.firstCall.calledWith('docker', [
      'build', '-t', tag,
      '--build-arg', 'TEST_ARG=cdk-test',
      'docker-path',
    ])).toEqual(true);

    expect(spawnSyncStub.secondCall.calledWith('docker', [
      'run', '--rm',
      tag,
    ])).toEqual(true);

  });

  test('bundling with image from asset with platform', () => {
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    const imageHash = '123456abcdef';
    const fingerprintStub = sinon.stub(FileSystem, 'fingerprint');
    fingerprintStub.callsFake(() => imageHash);
    const platform = 'linux/someArch99';

    const image = DockerImage.fromBuild('docker-path', { platform });
    image.run();

    const tagHash = crypto.createHash('sha256').update(JSON.stringify({
      path: 'docker-path',
      platform,
    })).digest('hex');
    const tag = `cdk-${tagHash}`;

    expect(spawnSyncStub.firstCall.calledWith('docker', [
      'build', '-t', tag,
      '--platform', platform,
      'docker-path',
    ])).toEqual(true);

    expect(spawnSyncStub.secondCall.calledWith('docker', [
      'run', '--rm',
      tag,
    ])).toEqual(true);

  });

  test('throws in case of spawnSync error', () => {
    sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
      error: new Error('UnknownError'),
    });

    const image = DockerImage.fromRegistry('alpine');
    expect(() => image.run()).toThrow(/UnknownError/);

  });

  test('throws if status is not 0', () => {
    sinon.stub(child_process, 'spawnSync').returns({
      status: -1,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    const image = DockerImage.fromRegistry('alpine');
    expect(() => image.run()).toThrow(/\[Status -1\]/);

  });

  test('BundlerDockerImage json is the bundler image name by default', () => {
    const image = DockerImage.fromRegistry('alpine');

    expect(image.toJSON()).toEqual('alpine');

  });

  test('BundlerDockerImage json is the bundler image if building an image', () => {
    sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });
    const imageHash = '123456abcdef';
    const fingerprintStub = sinon.stub(FileSystem, 'fingerprint');
    fingerprintStub.callsFake(() => imageHash);

    const image = DockerImage.fromBuild('docker-path');

    const tagHash = crypto.createHash('sha256').update(JSON.stringify({
      path: 'docker-path',
    })).digest('hex');

    expect(image.image).toEqual(`cdk-${tagHash}`);
    expect(image.toJSON()).toEqual(imageHash);
    expect(fingerprintStub.calledWith('docker-path', sinon.match({ extraHash: JSON.stringify({}) }))).toEqual(true);

  });

  test('custom dockerfile is passed through to docker exec', () => {
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('sha256:1234567890abcdef'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    const imagePath = path.join(__dirname, 'fs/fixtures/test1');
    DockerImage.fromAsset(imagePath, {
      file: 'my-dockerfile',
    });

    expect(spawnSyncStub.calledOnce).toEqual(true);
    const expected = path.join(imagePath, 'my-dockerfile');
    expect(new RegExp(`-f ${expected}`).test(spawnSyncStub.firstCall.args[1]?.join(' ') ?? '')).toEqual(true);


  });

  test('fromAsset', () => {
    sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('sha256:1234567890abcdef'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    const imagePath = path.join(__dirname, 'fs/fixtures/test1');
    const image = DockerImage.fromAsset(imagePath, {
      file: 'my-dockerfile',
    });
    expect(image).toBeDefined();
    expect(image.image).toBeDefined();

  });

  test('custom entrypoint is passed through to docker exec', () => {
    sinon.stub(process, 'platform').value('darwin');
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    const image = DockerImage.fromRegistry('alpine');
    image.run({
      entrypoint: ['/cool/entrypoint', '--cool-entrypoint-arg'],
      command: ['cool', 'command'],
      environment: {
        VAR1: 'value1',
        VAR2: 'value2',
      },
      volumes: [{ hostPath: '/host-path', containerPath: '/container-path' }],
      workingDirectory: '/working-directory',
      user: 'user:group',
    });

    expect(spawnSyncStub.calledWith('docker', [
      'run', '--rm',
      '-u', 'user:group',
      '-v', '/host-path:/container-path:delegated',
      '--env', 'VAR1=value1',
      '--env', 'VAR2=value2',
      '-w', '/working-directory',
      '--entrypoint', '/cool/entrypoint',
      'alpine',
      '--cool-entrypoint-arg',
      'cool', 'command',
    ], { stdio: ['ignore', process.stderr, 'inherit'] })).toEqual(true);

  });

  test('cp utility copies from an image', () => {
    // GIVEN
    const containerId = '1234567890abcdef1234567890abcdef';
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from(`${containerId}\n`),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    // WHEN
    DockerImage.fromRegistry('alpine').cp('/foo/bar', '/baz');

    // THEN
    expect(spawnSyncStub.calledWith(sinon.match.any, ['create', 'alpine'], sinon.match.any)).toEqual(true);
    expect(spawnSyncStub.calledWith(sinon.match.any, ['cp', `${containerId}:/foo/bar`, '/baz'], sinon.match.any)).toEqual(true);
    expect(spawnSyncStub.calledWith(sinon.match.any, ['rm', '-v', containerId])).toEqual(true);


  });

  test('cp utility cleans up after itself', () => {
    // GIVEN
    const containerId = '1234567890abcdef1234567890abcdef';
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from(`${containerId}\n`),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    spawnSyncStub.withArgs(sinon.match.any, sinon.match.array.startsWith(['cp']), sinon.match.any)
      .returns({
        status: 1,
        stderr: Buffer.from('it failed for a very good reason'),
        stdout: Buffer.from('stdout'),
        pid: 123,
        output: ['stdout', 'stderr'],
        signal: null,
      });

    // WHEN
    expect(() => {
      DockerImage.fromRegistry('alpine').cp('/foo/bar', '/baz');
    }).toThrow(/Failed.*copy/i);

    // THEN
    expect(spawnSyncStub.calledWith(sinon.match.any, ['rm', '-v', containerId])).toEqual(true);

  });

  test('cp utility copies to a temp dir of outputPath is omitted', () => {
    // GIVEN
    const containerId = '1234567890abcdef1234567890abcdef';
    sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from(`${containerId}\n`),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });

    // WHEN
    const tempPath = DockerImage.fromRegistry('alpine').cp('/foo/bar');

    // THEN
    expect(/cdk-docker-cp-/.test(tempPath)).toEqual(true);


  });

  test('adding user provided security-opt', () => {
    // GIVEN
    sinon.stub(process, 'platform').value('darwin');
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync').returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['stdout', 'stderr'],
      signal: null,
    });
    const image = DockerImage.fromRegistry('alpine');

    // GIVEN
    image.run({
      command: ['cool', 'command'],
      environment: {
        VAR1: 'value1',
        VAR2: 'value2',
      },
      securityOpt: 'no-new-privileges',
      volumes: [{ hostPath: '/host-path', containerPath: '/container-path' }],
      workingDirectory: '/working-directory',
      user: 'user:group',
    });

    expect(spawnSyncStub.calledWith('docker', [
      'run', '--rm',
      '--security-opt', 'no-new-privileges',
      '-u', 'user:group',
      '-v', '/host-path:/container-path:delegated',
      '--env', 'VAR1=value1',
      '--env', 'VAR2=value2',
      '-w', '/working-directory',
      'alpine',
      'cool', 'command',
    ], { stdio: ['ignore', process.stderr, 'inherit'] })).toEqual(true);

  });

  test('ensure selinux docker mount', () => {
    // GIVEN
    sinon.stub(process, 'platform').value('linux');
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync');
    spawnSyncStub.onFirstCall().returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['selinuxenable-command', 'stderr'],
      signal: null,
    });
    spawnSyncStub.onSecondCall().returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 124,
      output: ['docker run command', 'stderr'],
      signal: null,
    });

    // WHEN
    const image = DockerImage.fromRegistry('alpine');
    image.run({
      command: ['cool', 'command'],
      volumes: [{ hostPath: '/host-path', containerPath: '/container-path' }],
      workingDirectory: '/working-directory',
      user: 'user:group',
    });

    // THEN
    expect(spawnSyncStub.secondCall.calledWith('docker', [
      'run', '--rm',
      '-u', 'user:group',
      '-v', '/host-path:/container-path:z,delegated',
      '-w', '/working-directory',
      'alpine',
      'cool', 'command',
    ], { stdio: ['ignore', process.stderr, 'inherit'] })).toEqual(true);

  });

  test('ensure selinux docker mount on linux with selinux disabled', () => {
    // GIVEN
    sinon.stub(process, 'platform').value('linux');
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync');
    spawnSyncStub.onFirstCall().returns({
      status: 1,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['selinuxenabled output', 'stderr'],
      signal: null,
    });
    spawnSyncStub.onSecondCall().returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 124,
      output: ['docker run command', 'stderr'],
      signal: null,
    });

    // WHEN
    const image = DockerImage.fromRegistry('alpine');
    image.run({
      command: ['cool', 'command'],
      volumes: [{ hostPath: '/host-path', containerPath: '/container-path' }],
      workingDirectory: '/working-directory',
      user: 'user:group',
    });

    // THEN
    expect(spawnSyncStub.secondCall.calledWith('docker', [
      'run', '--rm',
      '-u', 'user:group',
      '-v', '/host-path:/container-path:delegated',
      '-w', '/working-directory',
      'alpine',
      'cool', 'command',
    ], { stdio: ['ignore', process.stderr, 'inherit'] })).toEqual(true);

  });
  test('ensure no selinux docker mount if selinuxenabled isn\'t an available command', () => {
    // GIVEN
    sinon.stub(process, 'platform').value('linux');
    const spawnSyncStub = sinon.stub(child_process, 'spawnSync');
    spawnSyncStub.onFirstCall().returns({
      status: 127,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 123,
      output: ['selinuxenabled output', 'stderr'],
      signal: null,
    });
    spawnSyncStub.onSecondCall().returns({
      status: 0,
      stderr: Buffer.from('stderr'),
      stdout: Buffer.from('stdout'),
      pid: 124,
      output: ['docker run command', 'stderr'],
      signal: null,
    });

    // WHEN
    const image = DockerImage.fromRegistry('alpine');
    image.run({
      command: ['cool', 'command'],
      volumes: [{ hostPath: '/host-path', containerPath: '/container-path' }],
      workingDirectory: '/working-directory',
      user: 'user:group',
    });

    // THEN
    expect(spawnSyncStub.secondCall.calledWith('docker', [
      'run', '--rm',
      '-u', 'user:group',
      '-v', '/host-path:/container-path:delegated',
      '-w', '/working-directory',
      'alpine',
      'cool', 'command',
    ], { stdio: ['ignore', process.stderr, 'inherit'] })).toEqual(true);

  });
});
