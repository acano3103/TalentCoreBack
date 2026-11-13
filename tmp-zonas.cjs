const fs = require('fs');
const mysql = require('mysql2/promise');

const env = fs.readFileSync('.env', 'utf8');
const linea = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const crudo = linea.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
const url = new URL(crudo);

async function main() {
  const conexion = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  });
  const [zonas] = await conexion.query(
    'SELECT zonaHoraria, COUNT(*) AS sitios FROM CatSites GROUP BY zonaHoraria',
  );
  console.log(JSON.stringify(zonas));
  await conexion.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
