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

  async getChangedFiles(baseBranch: string, sourceBranch: string): Promise<string[]> {
    const result = await this.git.diff(['--name-only', `${baseBranch}...${sourceBranch}`]);
    return result.trim().split('\n').filter(Boolean);
  }

  async getFileContent(ref: string, filePath: string): Promise<string> {
    const result = await this.git.show([`${ref}:${filePath}`]);
    return result;
  }

  async log(baseBranch: string, sourceBranch: string) {
    return this.git.log({ from: baseBranch, to: sourceBranch });
  }
}
