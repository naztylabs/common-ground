import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../dist/store.js';
import { discover, initialize } from '../dist/init.js';

async function fixture(t,files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cground-discovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const [file,content] of Object.entries(files)){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),typeof content==='string'?content:JSON.stringify(content));}
  return {root,store:new Store(root)};
}
const technologies=proposal=>new Set(proposal.detections.flatMap(p=>p.technologies));
async function approvable(store,proposal){
  assert.equal(proposal.requiresDeveloperApproval,true);await store.approveDefinitions(proposal.pillars);
  const registry=await store.read();assert.equal(store.facts(registry).length,0);
  const paths=store.chapters(registry).flatMap(c=>c.chapter.paths);assert.equal(paths.length,new Set(paths).size);
}

for(const [name,files,expected,pillar] of [
  ['Angular',{'package.json':{dependencies:{'@angular/core':'*'}},'src/app/app.ts':'export class App {}'},['Angular'],'web-applications'],
  ['React with Next.js',{'package.json':{dependencies:{react:'*',next:'*','react-dom':'*'}},'app/page.tsx':'export default function Page() {}'},['React','Next.js'],'web-applications'],
  ['Vue with Nuxt',{'package.json':{dependencies:{vue:'*',nuxt:'*'}},'pages/index.vue':'<template />'},['Vue','Nuxt'],'web-applications'],
  ['SvelteKit',{'package.json':{devDependencies:{svelte:'*','@sveltejs/kit':'*'}},'src/routes/+page.svelte':'<p>Hello</p>'},['Svelte','SvelteKit'],'web-applications'],
  ['Astro',{'package.json':{dependencies:{astro:'*'}},'src/pages/index.astro':'<html />'},['Astro'],'web-applications'],
  ['Swift package',{'Package.swift':'// swift-tools-version: 6.0\nimport PackageDescription','Sources/Core/Core.swift':'struct Core {}'},['Swift','Swift Package Manager'],'native-applications'],
  ['Xcode project',{'Example.xcodeproj/project.pbxproj':'// synthetic project','Example/App.swift':'struct App {}'},['Swift','Xcode'],'native-applications'],
  ['Java Maven Spring',{'pom.xml':'<project><groupId>org.springframework.boot</groupId></project>','src/main/java/App.java':'class App {}'},['Java','Maven','Spring Boot'],'jvm-applications'],
  ['Kotlin Gradle',{'build.gradle.kts':'plugins { kotlin("jvm") }','src/main/kotlin/App.kt':'class App'},['Kotlin','Gradle'],'jvm-applications'],
  ['Android',{'build.gradle':'plugins { id "com.android.application" }','src/main/AndroidManifest.xml':'<manifest/>','src/main/java/App.java':'class App {}'},['Android','Java'],'mobile-applications'],
  ['Python FastAPI',{'pyproject.toml':'[project]\ndependencies = ["fastapi>=0.1"]','src/app.py':'app = object()'},['Python','FastAPI'],'python-projects'],
  ['Python Django',{'requirements.txt':'Django>=4\n','manage.py':'# synthetic'},['Python','Django'],'python-projects'],
  ['Go',{'go.mod':'module example.test/service\ngo 1.22','main.go':'package main'},['Go'],'go-projects'],
  ['Rust',{'Cargo.toml':'[package]\nname = "demo"','src/main.rs':'fn main() {}'},['Rust'],'rust-projects'],
  ['.NET',{'App.csproj':'<Project Sdk="Microsoft.NET.Sdk.Web"/>','Program.cs':'class Program {}'},['.NET'],'dotnet-projects'],
  ['Ruby Rails',{'Gemfile':'gem "rails"','app/models/item.rb':'class Item; end'},['Ruby','Rails'],'ruby-projects'],
  ['PHP Laravel',{'composer.json':{require:{'laravel/framework':'*'}},'app/Item.php':'<?php class Item {}'},['PHP','Laravel'],'php-projects'],
  ['Flutter',{'pubspec.yaml':'name: example\ndependencies:\n  flutter:\n    sdk: flutter','lib/main.dart':'void main() {}'},['Dart','Flutter'],'mobile-applications'],
  ['Node backend',{'package.json':{dependencies:{express:'*','@nestjs/core':'*'}},'src/server.ts':'export {}'},['Node.js','Express','NestJS'],'javascript-projects'],
])test(`discovery recognizes ${name} and produces approvable empty chapter candidates`,async t=>{
  const {store}=await fixture(t,files);const proposal=await discover(store);const found=technologies(proposal);
  for(const technology of expected)assert.ok(found.has(technology),technology);assert.ok(proposal.pillars.some(p=>p.id===pillar));
  await approvable(store,proposal);
});

test('React Native/Expo coalesces React, Swift and Android sources into its mobile project',async t=>{
  const {store}=await fixture(t,{'package.json':{dependencies:{react:'*','react-native':'*',expo:'*'}},'App.tsx':'export {}',
    'ios/Example.xcodeproj/project.pbxproj':'// project','ios/Example/App.swift':'struct App {}',
    'android/build.gradle':'plugins { id "com.android.application" }','android/app/build.gradle':'plugins { id "com.android.application" }',
    'android/app/src/main/java/Main.java':'class Main {}'});
  const proposal=await discover(store);assert.deepEqual(proposal.pillars.map(p=>p.id),['mobile-applications']);assert.equal(proposal.detections.length,1);
  for(const tech of ['React','React Native','Expo','Swift','Android','Java'])assert.ok(technologies(proposal).has(tech),tech);
  await approvable(store,proposal);
});
test('workspace manifest plus web, native and JVM apps produces distinct project chapters without overlap',async t=>{
  const {store}=await fixture(t,{'package.json':{workspaces:['apps/*','packages/*'],devDependencies:{nx:'*'}},'nx.json':{},'turbo.json':{},'pnpm-workspace.yaml':'packages:\n - apps/*',
    'apps/web/package.json':{dependencies:{react:'*',next:'*'}},'apps/web/src/main.tsx':'export {}',
    'apps/mobile/package.json':{dependencies:{'react-native':'*',react:'*'}},'apps/mobile/ios/App.swift':'struct App {}',
    'apps/api/pom.xml':'<project/>','apps/api/src/App.java':'class App {}',
    'packages/ui/package.json':{peerDependencies:{react:'*'}},'packages/ui/src/Button.tsx':'export {}',
    '.github/workflows/ci.yml':'name: CI','azure-pipelines.yml':'steps: []'});
  const proposal=await discover(store);for(const role of ['workspace-tooling','web-applications','mobile-applications','jvm-applications','web-components','ci-cd'])assert.ok(proposal.pillars.some(p=>p.id===role),role);
  assert.ok(technologies(proposal).has('pnpm Workspaces'));assert.ok(technologies(proposal).has('Turborepo'));
  assert.equal(proposal.pillars.find(p=>p.id==='mobile-applications').chapters.length,1);
  await approvable(store,proposal);
});
test('Angular workspace declarations separate application and library roots and reject traversal',async t=>{
  const {store}=await fixture(t,{'package.json':{devDependencies:{'@angular/core':'*'}},'angular.json':{projects:{app:{root:'projects/site',projectType:'application'},ui:{root:'projects/ui',projectType:'library'},bad:{root:'../outside',projectType:'application'}}},
    'projects/site/src/main.ts':'export {}','projects/ui/src/public-api.ts':'export {}'});
  const proposal=await discover(store);assert.ok(proposal.warnings.some(w=>w.reason.includes('unsafe')));
  assert.ok(proposal.detections.some(p=>p.root==='projects/site'&&p.chapterId.startsWith('web-applications/')));
  assert.ok(proposal.detections.some(p=>p.root==='projects/ui'&&p.chapterId.startsWith('web-components/')));
  await approvable(store,proposal);
});
test('plain Gradle is not evidence of Java, React types are not evidence of React, and arbitrary YAML is not CI',async t=>{
  const {store}=await fixture(t,{'build.gradle.kts':'plugins {}','package.json':{devDependencies:{'@types/react':'*'}},'application/config.yaml':'jobs: []','README.md':'We might use Angular React Native Swift someday.'});
  const proposal=await discover(store);const found=technologies(proposal);assert.ok(!found.has('Java'));assert.ok(!found.has('React'));assert.ok(!found.has('Angular'));
  assert.ok(!proposal.pillars.some(p=>p.id==='ci-cd'));assert.ok(proposal.unclassifiedSample.includes('README.md'));
});
test('malformed and oversized manifests surface warnings without reading dependencies from lockfiles',async t=>{
  const {store}=await fixture(t,{'package.json':'{broken','web/package.json':' '.repeat(256*1024+1),'package-lock.json':{packages:{'node_modules/react':{version:'1'}}},'readme.md':'react'});
  const proposal=await discover(store);assert.equal(proposal.warningCount,2);assert.equal(technologies(proposal).has('React'),false);assert.equal(proposal.pillars.length,0);
});
test('scan skips symlinks, dependencies, generated native output, virtualenvs and environment files',async t=>{
  const {root,store}=await fixture(t,{'package.json':{dependencies:{react:'*'}},'Pods/Fake/Package.swift':'// fake','vendor/composer.json':{},'.venv/pyproject.toml':'[project]',
    'node_modules/react-native/package.json':{dependencies:{'react-native':'*'}},'DerivedData/Fake/App.swift':'struct Fake {}','.env.private':'react-native',
    'scripts/executable.config.js':'throw new Error("must not execute")'});
  await fs.symlink('/etc/passwd',path.join(root,'Package.swift'));
  const proposal=await discover(store);assert.deepEqual([...technologies(proposal)].sort(),['JavaScript','Node.js','React']);
  assert.ok(!JSON.stringify(proposal).includes('.env.private'));assert.ok(!proposal.unclassifiedSample.some(f=>f.startsWith('Pods/')));
  await assert.rejects(()=>fs.stat(store.file('knowledge.json')),e=>e.code==='ENOENT');
});
test('entry and manifest budgets and path samples are explicit and bounded',async t=>{
  const files={'package.json':{dependencies:{react:'*'}}};for(let i=0;i<1550;i++)files[`src/file-${String(i).padStart(4,'0')}.tsx`]='export {}';
  const {store}=await fixture(t,files);const proposal=await discover(store);
  assert.equal(proposal.scan.truncated,true);assert.equal(proposal.scan.inspectedEntries,1500);assert.ok(technologies(proposal).has('React'));
  assert.equal(proposal.pillars[0].chapters[0].paths.length,30);assert.equal(proposal.detections[0].pathsTruncated,true);
  await approvable(store,proposal);
});
test('manifest byte budget, warning sample and project sample never silently claim completeness',async t=>{
  const files={};for(let i=0;i<65;i++)files[`apps/project-${String(i).padStart(2,'0')}/package.json`]=JSON.stringify({dependencies:{react:'*'},description:'x'.repeat(220*1024)});
  const {store}=await fixture(t,files);const proposal=await discover(store);
  assert.ok(proposal.scan.manifestBytesRead<=2*1024*1024);assert.ok(proposal.warningCount>10);assert.equal(proposal.warnings.length,10);
  assert.ok(proposal.detections.length<=50);
});
test('many small projects are sampled with an explicit project count and stable collision-safe chapter IDs',async t=>{
  const files={};for(let i=0;i<55;i++)files[`apps/site-${i}/package.json`]={dependencies:{react:'*'}};
  files['apps/site_A/package.json']={dependencies:{react:'*'}};files['apps/site-A/package.json']={dependencies:{react:'*'}};
  const {store}=await fixture(t,files);const first=await discover(store),second=await discover(store);assert.deepEqual(first,second);
  assert.equal(first.detectedProjectCount,57);assert.equal(first.projectsTruncated,true);assert.equal(first.detections.length,50);
  await approvable(store,first);
});
test('init refresh never discovers or creates new pillars in an approved repository',async t=>{
  const {root,store}=await fixture(t,{'package.json':{dependencies:{react:'*'}}});const proposal=await initialize(store);
  await approvable(store,proposal);const before=await fs.readFile(store.file('knowledge.json'),'utf8');
  await fs.mkdir(path.join(root,'new-app'));await fs.writeFile(path.join(root,'new-app/Package.swift'),'// swift-tools-version: 6.0');
  assert.equal((await initialize(store)).existingRegistry,true);assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
  assert.ok(technologies(await discover(store)).has('Swift Package Manager'));assert.equal(await fs.readFile(store.file('knowledge.json'),'utf8'),before);
});
test('Nx executor signals identify apps while shared root dependencies remain workspace tooling',async t=>{
  const {store}=await fixture(t,{'package.json':{workspaces:['apps/*'],devDependencies:{nx:'*',react:'*',next:'*','@angular/core':'*'}},'nx.json':{},
    'apps/store/project.json':{projectType:'application',targets:{build:{executor:'@nx/next:build'}}},'apps/store/src/page.tsx':'export {}',
    'apps/admin/project.json':{projectType:'application',targets:{build:{executor:'@angular-devkit/build-angular:application'}}},'apps/admin/src/main.ts':'export {}',
    'libs/ui/project.json':{projectType:'library',targets:{build:{executor:'@nx/react:webpack'}}},'libs/ui/src/index.tsx':'export {}'});
  const proposal=await discover(store);
  assert.equal(proposal.detections.find(p=>p.root==='.').chapterId,'workspace-tooling/overview');
  assert.ok(proposal.detections.find(p=>p.root==='apps/store').technologies.includes('Next.js'));
  assert.ok(proposal.detections.find(p=>p.root==='apps/admin').technologies.includes('Angular'));
  assert.ok(proposal.detections.find(p=>p.root==='libs/ui').chapterId.startsWith('web-components/'));
  await approvable(store,proposal);
});
test('a web application in packages is not automatically classified as a shared library',async t=>{
  const {store}=await fixture(t,{'package.json':{workspaces:['packages/*']},'packages/site/package.json':{dependencies:{next:'*',react:'*'}},'packages/site/app/page.tsx':'export {}'});
  const proposal=await discover(store);assert.ok(proposal.detections.find(p=>p.root==='packages/site').chapterId.startsWith('web-applications/'));
  await approvable(store,proposal);
});
test('short and punctuation-heavy project roots still produce valid, distinct chapter definitions',async t=>{
  const {store}=await fixture(t,{'a/package.json':{dependencies:{react:'*'}},'ui/package.json':{dependencies:{react:'*'}},'apps/你好/package.json':{dependencies:{react:'*'}},'apps/site_A/package.json':{},'apps/site-A/package.json':{}});
  await approvable(store,await discover(store));
});
