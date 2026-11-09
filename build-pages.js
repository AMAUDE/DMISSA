// Génère docs/ (site statique pour GitHub Pages) à partir de public/ et data/
const fs=require('fs'),path=require('path');
const out=path.join(__dirname,'docs');
fs.rmSync(out,{recursive:true,force:true});
fs.cpSync(path.join(__dirname,'public'),out,{recursive:true});
fs.cpSync(path.join(__dirname,'data'),path.join(out,'data'),{recursive:true});
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('docs/ généré');
