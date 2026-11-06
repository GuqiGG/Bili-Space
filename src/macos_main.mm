#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static NSString *JSONString(id value){NSData *d=[NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingFragmentsAllowed error:nil];return d?[[NSString alloc]initWithData:d encoding:NSUTF8StringEncoding]:@"null";}
static BOOL BiliURL(NSURL *url){return [url.scheme isEqualToString:@"https"]&&[@[@"www.bilibili.com",@"search.bilibili.com",@"space.bilibili.com",@"t.bilibili.com",@"passport.bilibili.com",@"account.bilibili.com",@"live.bilibili.com",@"message.bilibili.com",@"manga.bilibili.com"] containsObject:url.host.lowercaseString];}

@interface BiliTransitionPlate : NSImageView
@end
@implementation BiliTransitionPlate
- (NSView *)hitTest:(NSPoint)point {return nil;}
@end

@interface BiliApp : NSObject<NSApplicationDelegate,NSWindowDelegate,WKNavigationDelegate,WKUIDelegate,NSURLSessionTaskDelegate,WKScriptMessageHandler,WKURLSchemeHandler>
@property(nonatomic,strong) NSWindow *window;
@property(nonatomic,strong) WKWebView *web;
@property(nonatomic,strong) NSMutableArray<NSWindow *> *popups;
@property(nonatomic,strong) NSMutableDictionary *state;
@property(nonatomic,strong) NSURL *resources;
@property(nonatomic,strong) NSURL *dataDirectory;
@property(nonatomic,copy) NSString *renderer;
@property(nonatomic) BOOL selfTest;
@property(nonatomic,copy) NSString *pendingEvent;
@property(nonatomic) NSInteger clipboardChange;
@property(nonatomic,copy) NSString *transitionCache;
@property(nonatomic,strong) NSMutableDictionary *transition;
@property(nonatomic,strong) BiliTransitionPlate *transitionPlate;
@property(nonatomic,copy) NSURL *transitionTarget;
@property(nonatomic) NSUInteger transitionSerial;
@property(nonatomic) BOOL transitionReduced;
@property(nonatomic) BOOL transitionBusy;
@property(nonatomic,strong) NSURLSession *apiSession;
@end

@implementation BiliApp
- (NSDictionary *)readJSON:(NSURL *)url {NSData *d=[NSData dataWithContentsOfURL:url];id j=d?[NSJSONSerialization JSONObjectWithData:d options:NSJSONReadingMutableContainers error:nil]:nil;return [j isKindOfClass:NSDictionary.class]?j:@{};}
- (void)save {if(self.selfTest)return;[JSONString(self.state) writeToURL:[self.dataDirectory URLByAppendingPathComponent:@"state.json"] atomically:YES encoding:NSUTF8StringEncoding error:nil];}
- (void)runJS:(NSString *)s {[self.web evaluateJavaScript:s completionHandler:nil];}
- (void)send:(NSString *)method value:(id)value {[self runJS:[NSString stringWithFormat:@"window.BiliSpace?.%@(%@)",method,JSONString(value)]];}
- (NSMutableDictionary *)currentProfile {for(NSMutableDictionary *p in self.state[@"profiles"])if([p[@"id"] isEqual:self.state[@"activeID"]])return p;return nil;}
- (void)accountState:(NSString *)event message:(NSString *)message {NSMutableArray *items=NSMutableArray.array;for(NSDictionary *p in self.state[@"profiles"])if([p[@"mid"] length])[items addObject:@{@"mid":p[@"mid"],@"uname":p[@"uname"]?:@"B站账号",@"face":p[@"face"]?:@""}];[self send:@"acceptAccountState" value:@{@"items":items,@"active":[self currentProfile][@"mid"]?:@"",@"busy":@NO,@"event":event?:@"",@"message":message?:@""}];}
- (void)appearance {NSString *theme=self.state[@"config"][@"theme"];self.window.appearance=[theme isEqualToString:@"dark"]?[NSAppearance appearanceNamed:NSAppearanceNameDarkAqua]:[theme isEqualToString:@"light"]?[NSAppearance appearanceNamed:NSAppearanceNameAqua]:nil;}
- (void)openProfile:(NSString *)identifier event:(NSString *)event {
 self.transition=nil;self.transitionCache=nil;[self.transitionPlate removeFromSuperview];self.transitionPlate=nil;
 if(!identifier.length)identifier=NSUUID.UUID.UUIDString;
 NSMutableDictionary *profile=nil;for(NSMutableDictionary *p in self.state[@"profiles"])if([p[@"id"] isEqual:identifier])profile=p;
 if(!profile){profile=[@{@"id":identifier} mutableCopy];[self.state[@"profiles"] addObject:profile];}
 self.state[@"activeID"]=identifier;self.pendingEvent=event;[self save];
 WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];configuration.mediaTypesRequiringUserActionForPlayback=WKAudiovisualMediaTypeNone;configuration.applicationNameForUserAgent=@"Version/17.0 Safari/605.1.15 BiliSpace/0.1.52";
 configuration.websiteDataStore=self.selfTest?WKWebsiteDataStore.nonPersistentDataStore:[WKWebsiteDataStore dataStoreForIdentifier:[[NSUUID alloc]initWithUUIDString:identifier]];
 [configuration setURLSchemeHandler:self forURLScheme:@"bili-space"];
 [configuration.userContentController addScriptMessageHandler:self name:@"native"];
 NSDictionary *payload=@{@"appInfo":[self readJSON:[self.resources URLByAppendingPathComponent:@"assets/app-info.json"]],@"config":self.state[@"config"],@"gm":self.state[@"gm"],@"runtime":@{@"platform":@"macos",@"testing":@(self.selfTest),@"running":@NO}};
 NSString *bridge=[NSString stringWithFormat:@"(()=>{if(window.top!==window)return;window.__BILI_NATIVE__=%@;window.chrome=window.chrome||{};window.chrome.webview={postMessage:m=>window.webkit.messageHandlers.native.postMessage(m)};})();\n",JSONString(payload)];
 [configuration.userContentController addUserScript:[[WKUserScript alloc]initWithSource:[bridge stringByAppendingString:self.renderer] injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
 [self.web.configuration.userContentController removeScriptMessageHandlerForName:@"native"];
 [self.web removeFromSuperview];self.web=[[WKWebView alloc]initWithFrame:self.window.contentView.bounds configuration:configuration];self.web.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;self.web.navigationDelegate=self;self.web.UIDelegate=self;self.web.underPageBackgroundColor=[NSColor colorWithWhite:.09 alpha:1];self.web.allowsBackForwardNavigationGestures=YES;
 [self.window.contentView addSubview:self.web];self.transitionPlate=[[BiliTransitionPlate alloc]initWithFrame:self.web.frame];self.transitionPlate.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;self.transitionPlate.imageScaling=NSImageScaleAxesIndependently;self.transitionPlate.hidden=YES;[self.window.contentView addSubview:self.transitionPlate positioned:NSWindowAbove relativeTo:self.web];if(self.selfTest)[self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"bili-space://assets/fixture.html"]]];else{NSString *html=[NSString stringWithContentsOfURL:[self.resources URLByAppendingPathComponent:@"assets/app.html"] encoding:NSUTF8StringEncoding error:nil];html=[html stringByReplacingOccurrencesOfString:@"https://bili-space.local/" withString:@"bili-space://assets/"];[self.web loadHTMLString:html baseURL:[NSURL URLWithString:@"https://www.bilibili.com/__client/app.html"]];}
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
 self.selfTest=[NSProcessInfo.processInfo.arguments containsObject:@"--self-test"];self.resources=NSBundle.mainBundle.resourceURL;self.popups=NSMutableArray.array;
 self.dataDirectory=[[[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject] URLByAppendingPathComponent:@"Bili-Space" isDirectory:YES];
 [NSFileManager.defaultManager createDirectoryAtURL:self.dataDirectory withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:nil];
 self.state=[[self readJSON:[self.dataDirectory URLByAppendingPathComponent:@"state.json"]] mutableCopy];if(self.selfTest)self.state=NSMutableDictionary.dictionary;
 NSMutableDictionary *defaults=[[self readJSON:[self.resources URLByAppendingPathComponent:@"defaults.json"]] mutableCopy];[defaults addEntriesFromDictionary:self.state[@"config"]?:@{}];self.state[@"config"]=defaults;if(self.state[@"pendingAccountID"]){self.state[@"activeID"]=self.state[@"pendingAccountID"];[self.state removeObjectForKey:@"pendingAccountID"];}if(![self.state[@"gm"] isKindOfClass:NSDictionary.class])self.state[@"gm"]=NSMutableDictionary.dictionary;if(![self.state[@"profiles"] isKindOfClass:NSArray.class])self.state[@"profiles"]=NSMutableArray.array;
 self.renderer=[NSString stringWithContentsOfURL:[self.resources URLByAppendingPathComponent:@"renderer.js"] encoding:NSUTF8StringEncoding error:nil];
 self.window=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,1440,940) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable|NSWindowStyleMaskFullSizeContentView backing:NSBackingStoreBuffered defer:NO];
 self.window.title=@"Bili-Space";self.window.titleVisibility=NSWindowTitleHidden;self.window.titlebarAppearsTransparent=YES;self.window.minSize=NSMakeSize(520,420);self.window.delegate=self;[self.window center];[self appearance];
 NSMenu *menu=[NSMenu new],*appMenu=[NSMenu new];NSMenuItem *root=[NSMenuItem new];[menu addItem:root];root.submenu=appMenu;NSMenuItem *settings=[[NSMenuItem alloc]initWithTitle:@"设置…" action:@selector(showSettings:) keyEquivalent:@","];settings.target=self;[appMenu addItem:settings];[appMenu addItem:NSMenuItem.separatorItem];[appMenu addItemWithTitle:@"退出 Bili-Space" action:@selector(terminate:) keyEquivalent:@"q"];NSMenuItem *editRoot=[NSMenuItem new];editRoot.title=@"编辑";[menu addItem:editRoot];NSMenu *edit=[NSMenu new];editRoot.submenu=edit;[edit addItemWithTitle:@"撤销" action:@selector(undo:) keyEquivalent:@"z"];[edit addItemWithTitle:@"剪切" action:@selector(cut:) keyEquivalent:@"x"];[edit addItemWithTitle:@"复制" action:@selector(copy:) keyEquivalent:@"c"];[edit addItemWithTitle:@"粘贴" action:@selector(paste:) keyEquivalent:@"v"];[edit addItemWithTitle:@"全选" action:@selector(selectAll:) keyEquivalent:@"a"];NSApp.mainMenu=menu;
 [self openProfile:self.state[@"activeID"] event:nil];if(self.selfTest)[self.window orderFront:nil];if(!self.selfTest){[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];}
 if(self.selfTest)dispatch_after(dispatch_time(DISPATCH_TIME_NOW,25*NSEC_PER_SEC),dispatch_get_main_queue(),^{fprintf(stderr,"macOS renderer self-test timed out\n");exit(2);});
}
- (void)applicationDidBecomeActive:(NSNotification *)notification {
 if(self.selfTest||self.web.loading||![self.state[@"config"][@"clipboardAutoOpen"] boolValue])return;
 NSPasteboard *board=NSPasteboard.generalPasteboard;if(board.changeCount==self.clipboardChange)return;self.clipboardChange=board.changeCount;
 NSString *text=[board stringForType:NSPasteboardTypeString];if(!text.length||text.length>16384)return;
 NSRegularExpression *pattern=[NSRegularExpression regularExpressionWithPattern:@"BV[A-Za-z0-9]{10}|b23\\.tv/" options:NSRegularExpressionCaseInsensitive error:nil];
 if([pattern firstMatchInString:text options:0 range:NSMakeRange(0,text.length)])[self send:@"offerClipboardVideo" value:text];
}
- (void)showSettings:(id)sender {[self runJS:@"window.BiliSpace?.openSettings()"];}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {return YES;}
- (void)applicationWillTerminate:(NSNotification *)notification {[self save];}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
 if(message.webView!=self.web||!message.frameInfo.mainFrame||!([message.body isKindOfClass:NSDictionary.class]))return;
 NSURL *source=message.frameInfo.request.URL;if(!BiliURL(source)&&!(self.selfTest&&[source.scheme isEqualToString:@"bili-space"]))return;
 NSDictionary *m=message.body;NSString *type=m[@"type"],*action=m[@"action"];
 if(self.selfTest&&[type isEqualToString:@"media-probe-result"]){fprintf(stdout,"macOS media decode self-test: %s\n",[JSONString(m) UTF8String]);exit([m[@"ok"] boolValue]?0:1);}
 if([type isEqualToString:@"config"]&&[m[@"value"] isKindOfClass:NSDictionary.class]){[self.state[@"config"] addEntriesFromDictionary:m[@"value"]];[self save];[self appearance];}
 else if([type isEqualToString:@"gm-set"]&&[m[@"key"] isKindOfClass:NSString.class]){self.state[@"gm"][m[@"key"]]=m[@"value"]?:NSNull.null;[self save];}
 else if([type isEqualToString:@"navigate"]){NSURL *url=[NSURL URLWithString:m[@"url"]];if(BiliURL(url))[self.web loadRequest:[NSURLRequest requestWithURL:url]];}
 else if([type isEqualToString:@"open-external"]){NSURL *url=[NSURL URLWithString:m[@"url"]];if([url.scheme isEqualToString:@"https"])[NSWorkspace.sharedWorkspace openURL:url];}
 else if([type isEqualToString:@"copy-video-link"]){NSString *text=m[@"url"];[NSPasteboard.generalPasteboard clearContents];BOOL ok=[NSPasteboard.generalPasteboard setString:text?:@"" forType:NSPasteboardTypeString];[self send:@"videoLinkCopied" value:@{@"ok":@(ok),@"url":text?:@""}];}
 else if([type isEqualToString:@"window"]){if([action isEqualToString:@"back"])[self.web goBack];else if([action isEqualToString:@"reload"])[self.web reload];else if([action isEqualToString:@"minimize"])[self.window miniaturize:nil];else if([action isEqualToString:@"maximize"])[self.window zoom:nil];else if([action isEqualToString:@"fullscreen"])[self.window toggleFullScreen:nil];else if([action isEqualToString:@"close"])[self.window close];else if([action isEqualToString:@"drag"]&&NSApp.currentEvent.type==NSEventTypeLeftMouseDown)[self.window performWindowDragWithEvent:NSApp.currentEvent];}
 else if([type isEqualToString:@"local-api"]){[self localAPI:m];return;}else if([type isEqualToString:@"transition"]){[self transitionMessage:m];return;}else if([type isEqualToString:@"accounts"])[self accounts:m];
 else if([type isEqualToString:@"updates"])[self send:@"acceptUpdateStatus" value:@{@"available":@NO,@"message":@"macOS 版本请从 GitHub Release 更新"}];
}
- (void)accounts:(NSDictionary *)m {NSString *action=m[@"action"];
 if([action isEqualToString:@"list"]){NSString *event=self.pendingEvent;self.pendingEvent=nil;[self accountState:event message:nil];return;}
 if([action isEqualToString:@"remember"]){NSDictionary *p=m[@"profile"];NSMutableDictionary *savedProfile=[self currentProfile];[self.web.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray<NSHTTPCookie *> *cookies){BOOL verified=NO;for(NSHTTPCookie *c in cookies)if([c.name isEqualToString:@"DedeUserID"]&&[c.value isEqualToString:[p[@"mid"] description]]&&([c.domain isEqualToString:@".bilibili.com"]||[c.domain isEqualToString:@"bilibili.com"]))verified=YES;if(verified){NSMutableDictionary *profile=savedProfile;for(NSString *key in @[@"mid",@"uname",@"face"])if([p[key] isKindOfClass:NSString.class])profile[key]=p[key];[self save];NSString *previous=self.state[@"pendingAccountID"];if(previous){[self.state removeObjectForKey:@"pendingAccountID"];[self openProfile:previous event:@"added"];}else [self accountState:@"saved" message:nil];}}];return;}
 if([action isEqualToString:@"add"]){self.state[@"pendingAccountID"]=self.state[@"activeID"]?:@"";[self save];[self openProfile:nil event:@"login-add"];return;}if([action isEqualToString:@"cancel-add"]){NSString *previous=self.state[@"pendingAccountID"];[self.state removeObjectForKey:@"pendingAccountID"];if(previous.length)[self openProfile:previous event:@"add-restored"];return;}
 if([action isEqualToString:@"switch"]){for(NSDictionary *p in [self.state[@"profiles"] copy])if([p[@"mid"] isEqual:m[@"mid"]]){[self openProfile:p[@"id"] event:@"switched"];return;}[self accountState:@"error" message:@"账号不存在，请重新登录"];return;}
 if([action isEqualToString:@"logout"]){WKHTTPCookieStore *store=self.web.configuration.websiteDataStore.httpCookieStore;NSString *old=self.state[@"activeID"];[store getAllCookies:^(NSArray<NSHTTPCookie *> *cookies){dispatch_group_t group=dispatch_group_create();for(NSHTTPCookie *c in cookies){NSString *d=c.domain;if([d isEqualToString:@"bilibili.com"]||[d hasSuffix:@".bilibili.com"]){dispatch_group_enter(group);[store deleteCookie:c completionHandler:^{dispatch_group_leave(group);}];}}dispatch_group_notify(group,dispatch_get_main_queue(),^{NSMutableArray *list=self.state[@"profiles"];for(NSDictionary *p in [list copy])if([p[@"id"] isEqual:old])[list removeObject:p];[self openProfile:nil event:@"signed-out"];});}];}
}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {NSURL *url=navigationAction.request.URL;if(webView==self.web&&navigationAction.targetFrame.mainFrame)self.transitionTarget=url;BOOL allowed=(navigationAction.targetFrame&&!navigationAction.targetFrame.mainFrame)||BiliURL(url)||([url.scheme isEqualToString:@"https"]&&[url.host isEqualToString:@"b23.tv"])||(self.selfTest&&[url.scheme isEqualToString:@"bili-space"])||[url.absoluteString isEqualToString:@"about:blank"]||webView!=self.web;if(allowed&&[@[@"https",@"about",@"bili-space"] containsObject:url.scheme])decisionHandler(WKNavigationActionPolicyAllow);else{decisionHandler(WKNavigationActionPolicyCancel);if([url.scheme isEqualToString:@"https"])[NSWorkspace.sharedWorkspace openURL:url];}}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))handler {handler([request.URL.scheme isEqual:@"https"]&&[request.URL.host isEqual:task.originalRequest.URL.host]?request:nil);}
- (void)localAPI:(NSDictionary *)m {
 NSString *identifier=m[@"id"],*value=m[@"url"];NSURL *url=[NSURL URLWithString:value];if(identifier.length>80||value.length>4096||![url.scheme isEqual:@"https"]||url.user.length||url.password.length||!(([url.host isEqual:@"api.bilibili.com"]&&[url.path hasPrefix:@"/x/"])||[value isEqual:@"https://www.bilibili.com/"]))return;
 WKWebView *view=self.web;[view.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray<NSHTTPCookie *> *all){NSMutableArray *cookies=NSMutableArray.array;for(NSHTTPCookie *c in all)if([c.domain isEqual:@".bilibili.com"]||[c.domain isEqual:@"bilibili.com"])[cookies addObject:c];NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:12];[request setAllHTTPHeaderFields:[NSHTTPCookie requestHeaderFieldsWithCookies:cookies]];[request setValue:@"https://www.bilibili.com/" forHTTPHeaderField:@"Referer"];[request setValue:@"https://www.bilibili.com" forHTTPHeaderField:@"Origin"];
 if(!self.apiSession)self.apiSession=[NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.ephemeralSessionConfiguration delegate:self delegateQueue:nil];[[self.apiSession dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){NSMutableDictionary *reply=[@{@"id":identifier,@"ok":@NO} mutableCopy];if(!error&&data.length<=8*1024*1024&&[response.URL.host isEqual:url.host]){reply[@"status"]=@([(NSHTTPURLResponse *)response statusCode]);reply[@"body"]=[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding]?:@"";}else reply[@"error"]=error.localizedDescription?:@"请求失败";dispatch_async(dispatch_get_main_queue(),^{if(self.web==view)[self runJS:[NSString stringWithFormat:@"window.BiliLocalAPI?.accept(%@)",JSONString(reply)]];});}] resume];}];
}
- (BOOL)transitionVideo:(NSURL *)url {return [url.path rangeOfString:@"^/(?:zh-Hans/|zh-Hant/|en/)?(?:video|bangumi|list|cheese)(?:/|$)" options:NSRegularExpressionSearch].location!=NSNotFound;}
- (void)transitionSnapshot:(void (^)(NSString *))done {
 if(self.transitionBusy){dispatch_after(dispatch_time(DISPATCH_TIME_NOW,24*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[self transitionSnapshot:done];});return;}self.transitionBusy=YES;WKWebView *view=self.web;
 [view takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *image,NSError *error){self.transitionBusy=NO;NSString *encoded=@"";if(image&&!error&&view==self.web){NSBitmapImageRep *rep=[[NSBitmapImageRep alloc]initWithData:image.TIFFRepresentation];NSData *png=[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];if(png)encoded=[@"data:image/png;base64," stringByAppendingString:[png base64EncodedStringWithOptions:0]];}done(encoded);}];
}
- (void)webView:(WKWebView *)view didStartProvisionalNavigation:(WKNavigation *)navigation {
 if(view!=self.web)return;self.transitionSerial++;NSURL *url=self.transitionTarget?:view.URL;
 if(!self.transitionCache.length||self.transitionReduced||[self transitionVideo:url]){self.transition=nil;self.transitionPlate.hidden=YES;return;}
 self.transition=[@{@"id":[NSString stringWithFormat:@"%lu",(unsigned long)self.transitionSerial],@"index":@(arc4random_uniform(12)),@"old":self.transitionCache} mutableCopy];
 NSData *data=[[NSData alloc]initWithBase64EncodedString:[self.transitionCache componentsSeparatedByString:@","].lastObject options:0];self.transitionPlate.image=[[NSImage alloc]initWithData:data];self.transitionPlate.hidden=NO;
}
- (void)webView:(WKWebView *)view didReceiveServerRedirectForProvisionalNavigation:(WKNavigation *)navigation {if(view==self.web&&[self transitionVideo:view.URL]){self.transition=nil;self.transitionPlate.hidden=YES;}}
- (void)transitionMessage:(NSDictionary *)m {
 NSString *action=m[@"action"];
 if([action isEqual:@"local-begin"]){NSString *token=m[@"token"];self.transitionSerial++;NSUInteger ticket=self.transitionSerial;[self transitionSnapshot:^(NSString *image){if(ticket!=self.transitionSerial)return;if(!image.length||[m[@"reduced"] boolValue]){[self runJS:[NSString stringWithFormat:@"window.TransitionManager?.commitLocal(%@)",JSONString(@{@"localToken":token})]];return;}self.transition=[@{@"id":[NSString stringWithFormat:@"%lu",(unsigned long)ticket],@"index":@(arc4random_uniform(12)),@"old":image,@"localToken":token} mutableCopy];NSData *data=[[NSData alloc]initWithBase64EncodedString:[image componentsSeparatedByString:@","].lastObject options:0];self.transitionPlate.image=[[NSImage alloc]initWithData:data];self.transitionPlate.hidden=NO;[self runJS:[NSString stringWithFormat:@"window.TransitionManager?.accept(%@)",JSONString(self.transition)]];}];return;}
 if([action isEqual:@"snapshot"]){self.transitionReduced=[m[@"reduced"] boolValue];if(self.transition||self.transitionReduced)return;NSUInteger owner=self.transitionSerial;[self transitionSnapshot:^(NSString *image){if(owner==self.transitionSerial&&!self.transition)self.transitionCache=image;}];return;}
 NSMutableDictionary *state=self.transition;
 if([action isEqual:@"arrive"]){if(state)[self runJS:[@"window.TransitionManager?.accept(" stringByAppendingFormat:@"%@)",JSONString(state)]];return;}
 if(!state||![state[@"id"] isEqual:m[@"id"]])return;
 if([action isEqual:@"attached"])self.transitionPlate.hidden=YES;
 else if([action isEqual:@"ready"]){self.transitionPlate.hidden=NO;[self runJS:@"window.TransitionManager?.prepareSnapshot()"];}
 else if([action isEqual:@"capture-new"]){[self transitionSnapshot:^(NSString *image){if(self.transition!=state)return;if(image.length)[self runJS:[NSString stringWithFormat:@"window.TransitionManager?.present(%@)",JSONString(@{@"id":state[@"id"],@"image":image})]];else{self.transition=nil;self.transitionPlate.hidden=YES;[self runJS:@"window.TransitionManager?.cancel()"];}}];}
 else if([action isEqual:@"done"]||[action isEqual:@"cancel"]){self.transition=nil;self.transitionPlate.hidden=YES;}
}
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {if(webView!=self.web)return;[self runJS:@"window.BiliSpace?.surfaceRevealed?.();window.BiliSpace?.setLoading(false);window.TransitionManager?.ready()"];if(NSApp.active)[self applicationDidBecomeActive:nil];if(self.selfTest)[self.web evaluateJavaScript:@"(()=>{const s=document.querySelector('#bili-space-root')?.shadowRoot;return !!window.BiliSpace&&!!s?.querySelector('.account-switch')&&s.querySelector('.lights').hidden&&s.querySelector('.window-actions').hidden})()" completionHandler:^(id value,NSError *error){BOOL ok=!error&&[value boolValue];fprintf(ok?stdout:stderr,"macOS WebKit renderer self-test: %s\n",ok?"passed":"failed");if(!ok)exit(1);[self runJS:@"window.BiliMediaProbe.run().then(x=>chrome.webview.postMessage({type:'media-probe-result',ok:true,result:x})).catch(e=>chrome.webview.postMessage({type:'media-probe-result',ok:false,error:e.message}))"];}];}
- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {NSURL *url=action.request.URL;if(BiliURL(url)&&![url.host isEqualToString:@"passport.bilibili.com"]){[self.web loadRequest:action.request];return nil;}configuration.userContentController=[WKUserContentController new];NSWindow *window=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,760,720) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];window.title=[NSString stringWithFormat:@"登录 · %@",url.host?:@"B站"];window.releasedWhenClosed=NO;WKWebView *child=[[WKWebView alloc]initWithFrame:window.contentView.bounds configuration:configuration];child.UIDelegate=self;child.navigationDelegate=self;child.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;[window.contentView addSubview:child];[self.popups addObject:window];[window center];[window makeKeyAndOrderFront:nil];return child;}
- (void)webViewDidClose:(WKWebView *)webView {if(webView!=self.web)[webView.window close];}
- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {NSAlert *alert=[NSAlert new];alert.messageText=message;[alert beginSheetModalForWindow:webView.window completionHandler:^(NSModalResponse response){completionHandler();}];}
- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {NSString *path=[task.request.URL.path.stringByRemovingPercentEncoding stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"/"]];NSURL *assets=[self.resources URLByAppendingPathComponent:@"assets" isDirectory:YES];NSURL *file=[[[assets URLByAppendingPathComponent:path] URLByStandardizingPath] URLByResolvingSymlinksInPath];if(![file.path hasPrefix:[assets.path stringByAppendingString:@"/"]]){[task didFailWithError:[NSError errorWithDomain:NSCocoaErrorDomain code:NSFileReadNoPermissionError userInfo:nil]];return;}NSData *data=[NSData dataWithContentsOfURL:file];if(!data){[task didFailWithError:[NSError errorWithDomain:NSCocoaErrorDomain code:NSFileReadNoSuchFileError userInfo:nil]];return;}NSDictionary *types=@{@"js":@"application/javascript",@"html":@"text/html",@"css":@"text/css",@"svg":@"image/svg+xml",@"png":@"image/png",@"ttf":@"font/ttf",@"woff2":@"font/woff2",@"json":@"application/json",@"mp4":@"video/mp4"};NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc]initWithURL:task.request.URL statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:@{@"Content-Type":types[file.pathExtension]?:@"application/octet-stream",@"Access-Control-Allow-Origin":@"*"}];[task didReceiveResponse:response];[task didReceiveData:data];[task didFinish];}
- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {}
@end

int main(int argc,const char *argv[]){@autoreleasepool{NSApplication *app=NSApplication.sharedApplication;BiliApp *delegate=[BiliApp new];app.delegate=delegate;[app setActivationPolicy:NSApplicationActivationPolicyRegular];[app run];}return 0;}
