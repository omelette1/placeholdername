const fs=require('node:fs');const path=require('node:path');const {pathToFileURL,fileURLToPath}=require('node:url');
class Emitter {listeners=[];event=fn=>{this.listeners.push(fn);return{dispose:()=>{this.listeners=this.listeners.filter(f=>f!==fn);}};};fire(value){for(const fn of this.listeners)fn(value);}dispose(){this.listeners=[];}}
class Uri {constructor(value){this.value=value;this.scheme=new URL(value).protocol.slice(0,-1);this.fsPath=this.scheme==='file'?fileURLToPath(value):new URL(value).pathname;}toString(){return this.value;}static file(p){return new Uri(pathToFileURL(p).href);}static parse(s){return new Uri(s);}}
class Range {constructor(a,b,c,d){this.start={line:a,character:b};this.end={line:c,character:d};}}
function fakeVscode(root){
 const commands=new Map(),warnings=[],errors=[],outputs=[],panels=[],editors=[],docs=[],diagnostics=new Map(),types=[],watchers=[],trees=[];
 const changes=new Emitter(),visibleChanges=new Emitter(),workspaceChanges=new Emitter();let dialogChoice,modeChoice='current';
 const vscode={Uri,Range,EventEmitter:Emitter,ThemeColor:class{constructor(id){this.id=id;}},DecorationRangeBehavior:{ClosedClosed:1},RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},ViewColumn:{One:1,Beside:2},ProgressLocation:{Notification:15},DiagnosticSeverity:{Warning:1},Diagnostic:class{constructor(range,message){this.range=range;this.message=message;}},Location:class{constructor(uri,range){this.uri=uri;this.range=range;}},DiagnosticRelatedInformation:class{constructor(location,message){this.location=location;this.message=message;}},env:{sessionId:'mock-window'},
  languages:{createDiagnosticCollection:()=>({clear(){diagnostics.clear();},set(uri,values){diagnostics.set(uri.fsPath,values);},dispose(){}})},
  commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return{dispose(){}};},executeCommand:async(id,...args)=>commands.get(id)?.(...args)},
  workspace:{name:'Mock workspace',workspaceFolders:root?[{uri:Uri.file(root)}]:[],textDocuments:docs,getConfiguration:()=>({inspect:key=>key==='nodePath'?{globalValue:process.execPath}:{}}),onDidChangeWorkspaceFolders:workspaceChanges.event,onDidChangeTextDocument:changes.event,
   createFileSystemWatcher:pattern=>{const change=new Emitter(),create=new Emitter(),remove=new Emitter();const watcher={pattern,onDidChange:change.event,onDidCreate:create.event,onDidDelete:remove.event,change,create,remove,disposed:false,dispose(){this.disposed=true;change.dispose();create.dispose();remove.dispose();}};watchers.push(watcher);return watcher;},
   openTextDocument:async uri=>{let doc=docs.find(d=>d.uri.toString()===uri.toString());if(!doc){const text=fs.readFileSync(uri.fsPath,'utf8');doc={uri,isDirty:false,text,lineCount:text.split('\n').length,getText(){return this.text;},lineAt(i){return{text:this.text.split('\n')[i]};}};docs.push(doc);}return doc;}
  },
  window:{visibleTextEditors:editors,onDidChangeVisibleTextEditors:visibleChanges.event,
   createOutputChannel:()=>({appendLine:s=>outputs.push(s),show(){},dispose(){}}),
   createTreeView:(_id,opts)=>{const tree={provider:opts.treeDataProvider,message:'',reveal:async()=>{},dispose(){}};trees.push(tree);return tree;},
   createTextEditorDecorationType:style=>{const type={style,dispose(){}};types.push(type);return type;},
   createWebviewPanel:(_id,title)=>{const messages=new Emitter(),closed=new Emitter();const panel={title,webview:{html:'',onDidReceiveMessage:messages.event},messages,reveal(){},onDidDispose:closed.event,dispose(){closed.fire();}};panels.push(panel);return panel;},
   withProgress:(_opts,fn)=>fn({report(){}}),showWarningMessage:(...args)=>{warnings.push(args);return Promise.resolve();},showErrorMessage:(...args)=>{errors.push(args);return Promise.resolve();},showInformationMessage:()=>Promise.resolve(),showOpenDialog:async()=>dialogChoice,showQuickPick:async options=>options.find(o=>o.mode===modeChoice),
   showTextDocument:async(doc,opts)=>{if(doc instanceof Uri)doc=await vscode.workspace.openTextDocument(doc);let editor=editors.find(e=>e.document.uri.toString()===doc.uri.toString());if(!editor){editor={document:doc,decorations:new Map(),setDecorations(type,values){this.decorations.set(type,values);}};editors.push(editor);}editor.selection=opts.selection;editor.viewColumn=opts.viewColumn;vscode.window.activeTextEditor=editor;visibleChanges.fire(editors);return editor;}
  }
 };
 return {vscode,commands,warnings,errors,outputs,panels,editors,docs,diagnostics,types,watchers,trees,changes,workspaceChanges,setDialog:choice=>{dialogChoice=choice;},setMode:mode=>{modeChoice=mode;},flatten:()=>{const out=[];function visit(items){for(const item of items){out.push(item);if(item.children)visit(item.children);}}visit(trees[0].provider.getChildren());return out;}};
}
module.exports={fakeVscode};
