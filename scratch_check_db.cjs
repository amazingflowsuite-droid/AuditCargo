const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://postgres.lpngglwlzepwmbpywhxr:w102030w@aws-0-us-east-1.pooler.supabase.com:6543/postgres'});
c.connect().then(() => {
  return c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'trips'");
}).then(r => {
  console.log(r.rows);
}).finally(() => {
  process.exit();
});
