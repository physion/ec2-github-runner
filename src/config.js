const core = require('@actions/core');
const github = require('@actions/github');

class Config {
  constructor() {
    this.input = {
      mode: core.getInput('mode'),
      githubToken: core.getInput('github-token'),
      ec2ImageId: core.getInput('ec2-image-id'),
      ec2InstanceType: core.getInput('ec2-instance-type'),
      ec2InstanceCount: core.getInput('ec2-instance-count'),
      subnetId: core.getInput('subnet-id'),
      securityGroupId: core.getInput('security-group-id'),
      label: core.getInput('label'),
      ec2InstanceIds: core.getInput('ec2-instance-id'),
      iamRoleName: core.getInput('iam-role-name'),
      keyPairName: core.getInput('key-pair-name'),
      runnerHomeDir: core.getInput('runner-home-dir'),
      preRunnerScript: core.getInput('pre-runner-script'),
    };

    const tags = JSON.parse(core.getInput('aws-resource-tags'));
    this.tagSpecifications = null;
    if (tags.length > 0) {
      this.tagSpecifications = [{ResourceType: 'instance', Tags: tags}, {ResourceType: 'volume', Tags: tags}];
    }

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    //
    // validate input
    //

    if (!this.input.mode) {
      throw new Error(`The 'mode' input is not specified`);
    }

    if (!this.input.githubToken) {
      throw new Error(`The 'github-token' input is not specified`);
    }

    if (this.input.mode === 'start') {
      if (!this.input.ec2ImageId || !this.input.ec2InstanceType || !this.input.subnetId || !this.input.securityGroupId || !this.input.keyPairName) {
        throw new Error(`Not all the required inputs are provided for the 'start' mode`);
      }

      if (this.input.ec2InstanceCount === undefined) {
        this.input.ec2InstanceCount = 1;
      }
      const parsedEc2InstanceCount = parseInt(this.input.ec2InstanceCount);
      if (isNaN(parsedEc2InstanceCount)) {
        throw new Error(`The 'ec2-instance-count' input has illegal value '${this.input.ec2InstanceCount}'`);
      } else if (parsedEc2InstanceCount < 1) {
        throw new Error(`The 'ec2-instance-count' input must be greater than zero`);
      }
      this.input.ec2InstanceCount = parsedEc2InstanceCount;
    } else if (this.input.mode === 'stop') {
      if (!this.input.label || !this.input.ec2InstanceIds) {
        throw new Error(`Not all the required inputs are provided for the 'stop' mode`);
      }

      try {
        const parsedEc2InstanceIds = JSON.parse(this.input.ec2InstanceIds);
        this.input.ec2InstanceIds = parsedEc2InstanceIds;
      } catch (error) {
        core.info(`Got error ${error} when parsing '${this.input.ec2InstanceIds}' as JSON, assuming that it is a raw string containing a single EC2 instance ID`);
        this.input.ec2InstanceIds = [this.input.ec2InstanceIds];
      }
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.');
    }
  }

  generateUniqueLabel() {
    return Math.random().toString(36).substr(2, 5);
  }
}

try {
  module.exports = new Config();
} catch (error) {
  core.error(error);
  core.setFailed(error.message);
}
