import fs from 'node:fs';

const rootGradle = 'android/build.gradle';
const appGradle = 'android/app/build.gradle';
if (!fs.existsSync(rootGradle) || !fs.existsSync(appGradle)) {
  throw new Error('Android Gradle files were not generated. Run npx cap add android first.');
}
let root = fs.readFileSync(rootGradle, 'utf8');
let app = fs.readFileSync(appGradle, 'utf8');

if (!root.includes('com.google.gms:google-services') && !root.includes("com.google.gms.google-services' version")) {
  if (root.includes('dependencies {')) {
    root = root.replace('dependencies {', "dependencies {\n        classpath 'com.google.gms:google-services:4.4.2'");
  } else if (root.includes('plugins {')) {
    root = root.replace('plugins {', "plugins {\n    id 'com.google.gms.google-services' version '4.4.2' apply false");
  } else {
    throw new Error('Could not safely configure Google Services in android/build.gradle.');
  }
}
if (!app.includes("com.google.gms.google-services")) {
  if (app.includes('plugins {')) {
    app = app.replace('plugins {', "plugins {\n    id 'com.google.gms.google-services'");
  } else if (app.includes("apply plugin: 'com.android.application'")) {
    app = app.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'com.google.gms.google-services'");
  } else {
    throw new Error('Could not safely configure Google Services in android/app/build.gradle.');
  }
}
fs.writeFileSync(rootGradle, root);
fs.writeFileSync(appGradle, app);
console.log('Configured Google Services Gradle plugin.');
