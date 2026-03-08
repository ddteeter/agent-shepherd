import simpleGit, { type SimpleGit } from 'simple-git';

export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  }

  async getDiff(baseBranch: string, sourceBranch: string): Promise<string> {
    const result = await this.git.diff([`${baseBranch}...${sourceBranch}`]);
    return result;
  }

  async getChangedFiles(
    baseBranch: string,
    sourceBranch: string,
  ): Promise<string[]> {
    const result = await this.git.diff([
      '--name-only',
      `${baseBranch}...${sourceBranch}`,
    ]);
    return result.trim().split('\n').filter(Boolean);
  }

  async getFileContent(ref: string, filePath: string): Promise<string> {
    const result = await this.git.show([`${ref}:${filePath}`]);
    return result;
  }

  async log(baseBranch: string, sourceBranch: string) {
    return this.git.log({ from: baseBranch, to: sourceBranch });
  }

  async getHeadSha(branch: string): Promise<string> {
    const result = await this.git.revparse([branch]);
    return result.trim();
  }

  async getDiffBetweenCommits(sha1: string, sha2: string): Promise<string> {
    const result = await this.git.diff([`${sha1}..${sha2}`]);
    return result;
  }
}
