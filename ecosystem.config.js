module.exports = {
  apps: [{
    name:"copytrade",
    script: 'index.js',
    watch: '.',
    autorestart: true,
    watch: ['./configfolder/']
  }],

  deploy: {
    production: {
      user: 'SSH_USERNAME',
      host: 'SSH_HOSTMACHINE',
      ref: 'origin/master',
      repo: 'https://github.com/btm2021/cp',
      path: '/home/ubuntu/cp',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
