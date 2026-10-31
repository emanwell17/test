import {spawnSync} from 'node:child_process';
let binary=process.env.FFMPEG_PATH;
if(!binary){
 if(spawnSync('ffmpeg',['-version'],{stdio:'ignore',windowsHide:true}).status===0)binary='ffmpeg';
 else{
  binary=(await import('ffmpeg-static')).default;
  if(spawnSync(binary,['-version'],{stdio:'ignore',windowsHide:true}).status!==0){
   const install=spawnSync(process.execPath,['node_modules/ffmpeg-static/install.js'],{stdio:'inherit',windowsHide:true});if(install.status!==0)throw Error('FFmpeg installation failed');
  }
 }
}
if(spawnSync(binary,['-version'],{stdio:'ignore',windowsHide:true}).status!==0)throw Error('FFmpeg is unavailable');
console.log('FFmpeg runtime verified');
