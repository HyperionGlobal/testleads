import { tick } from '../lib/pipeline';
let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
async function main(){console.log(JSON.stringify({event:'worker_started'}));while(!stopping){try{await tick();}catch(e){console.error(JSON.stringify({event:'worker_error',error:e instanceof Error?e.message:'Unknown'}));}await new Promise(r=>setTimeout(r,15000));}}main();
