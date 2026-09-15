module.exports = {
  apps: [
    {
      name: 'api_talentcore_poc',
      script: 'dist/src/main.js', 
      cwd: './',
      instances: 1,
      exec_mode: 'fork', 
      watch: false,
      max_memory_restart: '1536M',
      
      env: {
        NODE_ENV: 'development',
        PORT: 1121
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 1121
      },

      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      min_uptime: '30s',
      max_restarts: 5,
      restart_delay: 4000,
      
      monitoring: false,
      
      node_args: [
        '--max-old-space-size=1536',
        '--no-deprecation'
      ],
      
      kill_timeout: 10000,
      listen_timeout: 8000,
      
      autorestart: true,
      
      
      wait_ready: true,
      listen_timeout: 8000,
      kill_timeout: 10000,
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      
      // Configuración de salud
      health_check_grace_period: 3000, // 3 segundos de gracia para health checks
      
      
      max_memory_restart: '1536M',
      
      max_cpu_restart: 80,
   
      ignore_watch: [
        'node_modules',
        'logs',
        'dist',
        '.git',
        '*.log'
      ]
    }
  ]
};
