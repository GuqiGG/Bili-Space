// iOS / iPadOS host: the desktop bilibili site in one WKWebView with the same client script as the other platforms.
// Built unsigned in CI (scripts/build_ios.sh); people sign the .ipa themselves (AltStore, Sideloadly and the like).
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static NSString *JSONString(id value){NSData *d=[NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingFragmentsAllowed error:nil];return d?[[NSString alloc]initWithData:d encoding:NSUTF8StringEncoding]:@"null";}
static NSArray *BiliHosts(void){return @[@"www.bilibili.com",@"search.bilibili.com",@"space.bilibili.com",@"t.bilibili.com",@"passport.bilibili.com",@"account.bilibili.com",@"live.bilibili.com",@"message.bilibili.com",@"manga.bilibili.com"];}
static BOOL BiliURL(NSURL *url){return [url.scheme isEqualToString:@"https"]&&[BiliHosts() containsObject:url.host];}
static NSString *const DesktopUA=@"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BiliSpace/iOS";

@interface BiliViewController : UIViewController <WKScriptMessageHandler,WKNavigationDelegate,WKUIDelegate,WKURLSchemeHandler>
@property(nonatomic,strong) WKWebView *web;
@property(nonatomic,strong) NSMutableDictionary *config;
@property(nonatomic,strong) NSMutableDictionary *gm;
@property(nonatomic,copy) NSString *renderer;
@end

@implementation BiliViewController
- (NSURL *)resource:(NSString *)path {return [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:path];}
- (id)readJSON:(NSString *)path {NSData *d=[NSData dataWithContentsOfURL:[self resource:path]];id j=d?[NSJSONSerialization JSONObjectWithData:d options:NSJSONReadingMutableContainers error:nil]:nil;return [j isKindOfClass:NSDictionary.class]?j:[NSMutableDictionary dictionary];}

// The injected script carries the current settings; it is rebuilt whenever they change, so every new page starts from
// what was last saved (a script built once at launch made each page think the onboarding had never been seen).
- (NSString *)pageScript {
    NSDictionary *payload=@{@"appInfo":[self readJSON:@"app-info.json"],@"config":self.config,@"gm":self.gm,@"runtime":@{@"platform":@"ios",@"device":(UIDevice.currentDevice.userInterfaceIdiom==UIUserInterfaceIdiomPad?@"tablet":@"phone"),@"testing":@NO,@"running":@NO}};
    NSString *bridge=[NSString stringWithFormat:@"(()=>{if(window.top!==window)return;window.__BILI_NATIVE__=%@;window.chrome=window.chrome||{};window.chrome.webview={postMessage:m=>window.webkit.messageHandlers.native.postMessage(m)};})();\n",JSONString(payload)];
    // 按设备实际宽度排版；手机上客户端会换成手机排版（底部标签栏、首页一行两个）。
    NSString *width=@"device-width,initial-scale=1,viewport-fit=cover";
    NSString *viewport=[NSString stringWithFormat:@"(()=>{if(window.top!==window)return;const put=()=>{const h=document.head;if(!h)return false;let m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';h.prepend(m);}m.content='width=%@';return true;};if(!put())new MutationObserver((r,o)=>{if(put())o.disconnect();}).observe(document,{childList:true,subtree:true});})();\n",width];
    return [[bridge stringByAppendingString:viewport] stringByAppendingString:self.renderer?:@""];
}
- (void)registerScript {
    WKUserContentController *c=self.web.configuration.userContentController;[c removeAllUserScripts];
    [c addUserScript:[[WKUserScript alloc]initWithSource:[self pageScript] injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
}
- (void)save {
    [NSUserDefaults.standardUserDefaults setObject:JSONString(self.config) forKey:@"config"];
    [NSUserDefaults.standardUserDefaults setObject:JSONString(self.gm) forKey:@"gm"];
    [self registerScript];
}
- (NSMutableDictionary *)stored:(NSString *)key {
    NSString *raw=[NSUserDefaults.standardUserDefaults stringForKey:key];id j=raw?[NSJSONSerialization JSONObjectWithData:[raw dataUsingEncoding:NSUTF8StringEncoding] options:NSJSONReadingMutableContainers error:nil]:nil;
    return [j isKindOfClass:NSDictionary.class]?j:[NSMutableDictionary dictionary];
}
- (void)send:(NSString *)method value:(id)value {[self.web evaluateJavaScript:[NSString stringWithFormat:@"window.BiliSpace?.%@?.(%@)",method,JSONString(value)] completionHandler:nil];}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor=[UIColor colorWithWhite:.09 alpha:1];
    self.renderer=[NSString stringWithContentsOfURL:[self resource:@"renderer.js"] encoding:NSUTF8StringEncoding error:nil];
    NSMutableDictionary *defaults=[self readJSON:@"defaults.json"];[defaults addEntriesFromDictionary:[self stored:@"config"]];self.config=defaults;self.gm=[self stored:@"gm"];

    WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];
    configuration.allowsInlineMediaPlayback=YES;configuration.allowsPictureInPictureMediaPlayback=YES;
    configuration.mediaTypesRequiringUserActionForPlayback=WKAudiovisualMediaTypeNone;
    configuration.websiteDataStore=WKWebsiteDataStore.defaultDataStore;
    [configuration setURLSchemeHandler:self forURLScheme:@"bili-space"];
    [configuration.userContentController addScriptMessageHandler:self name:@"native"];
    self.web=[[WKWebView alloc]initWithFrame:self.view.bounds configuration:configuration];
    self.web.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;
    self.web.navigationDelegate=self;self.web.UIDelegate=self;self.web.allowsBackForwardNavigationGestures=YES;
    self.web.customUserAgent=DesktopUA;self.web.opaque=NO;self.web.backgroundColor=self.view.backgroundColor;
    [self.view addSubview:self.web];
    [self registerScript];
    [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"https://www.bilibili.com/"]]];
}

- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    if(message.webView!=self.web||!message.frameInfo.mainFrame||![message.body isKindOfClass:NSDictionary.class])return;
    if(!BiliURL(message.frameInfo.request.URL))return;
    NSDictionary *m=message.body;NSString *type=m[@"type"],*action=m[@"action"];
    if([type isEqualToString:@"config"]&&[m[@"value"] isKindOfClass:NSDictionary.class]){[self.config addEntriesFromDictionary:m[@"value"]];[self save];}
    else if([type isEqualToString:@"gm-set"]&&[m[@"key"] isKindOfClass:NSString.class]){self.gm[m[@"key"]]=m[@"value"]?:NSNull.null;[self save];}
    else if([type isEqualToString:@"navigate"]){NSURL *url=[NSURL URLWithString:m[@"url"]?:@""];if(BiliURL(url))[self.web loadRequest:[NSURLRequest requestWithURL:url]];}
    else if([type isEqualToString:@"open-external"]){NSURL *url=[NSURL URLWithString:m[@"url"]?:@""];if([url.scheme isEqualToString:@"https"])[UIApplication.sharedApplication openURL:url options:@{} completionHandler:nil];}
    else if([type isEqualToString:@"window"]){
        if([action isEqualToString:@"back"]&&self.web.canGoBack)[self.web goBack];
        else if([action isEqualToString:@"forward"]&&self.web.canGoForward)[self.web goForward];
        else if([action isEqualToString:@"reload"])[self.web reload];
    }
    else if([type isEqualToString:@"navigation-state"]&&[action isEqualToString:@"read"])
        [self.web evaluateJavaScript:[NSString stringWithFormat:@"window.__bsAcceptNavigationState?.(%@)",JSONString(@{@"back":@(self.web.canGoBack),@"forward":@(self.web.canGoForward),@"visible":@3,@"categoryVisible":@NO,@"route":@""})] completionHandler:nil];
    else if([type isEqualToString:@"copy-video-link"]){NSString *url=[m[@"url"] isKindOfClass:NSString.class]?m[@"url"]:@"";UIPasteboard.generalPasteboard.string=url;[self send:@"videoLinkCopied" value:@{@"url":url,@"ok":@YES}];}
}

// The site and its own subframes load here; other https pages open in Safari, and app links (bilibili://) are ignored.
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url=action.request.URL;
    if(!action.targetFrame.isMainFrame&&action.targetFrame){decisionHandler(WKNavigationActionPolicyAllow);return;}
    if(BiliURL(url)||[url.host isEqualToString:@"b23.tv"]||[url.scheme isEqualToString:@"about"]){decisionHandler(WKNavigationActionPolicyAllow);return;}
    if([url.scheme isEqualToString:@"https"])[UIApplication.sharedApplication openURL:url options:@{} completionHandler:nil];
    decisionHandler(WKNavigationActionPolicyCancel);
}
// window.open (login windows and the like) stays in this view.
- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
    if(action.request.URL)[webView loadRequest:action.request];return nil;
}

// bili-space://assets/… : the client's own files (fonts, onboarding pictures, translations) from inside the app.
- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
    NSURL *url=task.request.URL;NSString *path=[url.host stringByAppendingString:url.path?:@""];
    if([path containsString:@".."]){[task didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorFileDoesNotExist userInfo:nil]];return;}
    NSData *data=[NSData dataWithContentsOfURL:[self resource:path]];
    if(!data){[task didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorFileDoesNotExist userInfo:nil]];return;}
    NSString *ext=path.pathExtension.lowercaseString;
    NSDictionary *types=@{@"svg":@"image/svg+xml",@"png":@"image/png",@"webp":@"image/webp",@"jpg":@"image/jpeg",@"json":@"application/json",@"ttf":@"font/ttf",@"txt":@"text/plain; charset=utf-8",@"mp4":@"video/mp4",@"webm":@"video/webm",@"html":@"text/html; charset=utf-8",@"js":@"text/javascript"};
    NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc]initWithURL:url statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:@{@"Content-Type":types[ext]?:@"application/octet-stream",@"Access-Control-Allow-Origin":@"*"}];
    [task didReceiveResponse:response];[task didReceiveData:data];[task didFinish];
}
- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {}
@end

@interface BiliAppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation BiliAppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    self.window=[[UIWindow alloc]initWithFrame:UIScreen.mainScreen.bounds];
    self.window.rootViewController=[BiliViewController new];[self.window makeKeyAndVisible];return YES;
}
@end

int main(int argc,char *argv[]){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(BiliAppDelegate.class));}}
