@echo off
cd /d "%~dp0"
node build-libs.js > t16.txt 2>&1
node -e "const vm=require('vm'),fs=require('fs');const code=fs.readFileSync('lib/mqtt.js','utf8');try{vm.runInThisContext(code)}catch(e){console.log('THROW:',e.message)}console.log('VM_CHECK global.mqtt.connect =',typeof (global.mqtt&&global.mqtt.connect));" >> t16.txt 2>&1
node test_yjs.js >> t16.txt 2>&1
node --check js\yjstcb.js >> t16.txt 2>&1
node --check js\ycollab.js >> t16.txt 2>&1
node --check js\yjs-config.js >> t16.txt 2>&1
node --check build-libs.js >> t16.txt 2>&1
node test_yjs.js > t15.txt 2>&1
node smoke-mqtt.tmp.js >> t15.txt 2>&1
node --check js\yjstcb.js >> t15.txt 2>&1
node --check js\yjs-config.js >> t15.txt 2>&1
node --check js\ycollab.js >> t15.txt 2>&1
