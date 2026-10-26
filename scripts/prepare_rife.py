from pathlib import Path
import onnx,json,hashlib,numpy as np,onnxruntime as ort,time
root=Path.cwd();m=onnx.load('verification/models/rife49.original.onnx');d={o:n for n in m.graph.node for o in n.output}
flow='/Add_22_output_0';mask='/Sigmoid_output_0';onnx.utils.extract_model('verification/models/rife49.original.onnx','assets/ai/rife49-flow.onnx',['img0','img1','timestep'],[flow,mask])
x=onnx.load('assets/ai/rife49-flow.onnx');onnx.checker.check_model(x);print('flow model',len(x.graph.node),'nodes',Path('assets/ai/rife49-flow.onnx').stat().st_size)
opts=ort.SessionOptions();opts.log_severity_level=3
s=ort.InferenceSession('assets/ai/rife49-flow.onnx',sess_options=opts,providers=['CPUExecutionProvider']);a=np.zeros((1,3,64,96),np.float32);a[:,:,20:44,20:44]=1;b=np.zeros_like(a);b[:,:,20:44,36:60]=1;t=time.monotonic();r=s.run(None,{'img0':a,'img1':b,'timestep':np.array([.5],np.float32)});print([(z.shape,float(z.min()),float(z.max())) for z in r],time.monotonic()-t)
np.savez('verification/rife-flow-proof.npz',a=a,b=b,flow=r[0],mask=r[1]);
# Sample the source image with bilinear border padding, just as the final ONNX GridSample.
def warp(image,flow):
 h,w=flow.shape[-2:];image=np.pad(image,((0,0),(0,0),(0,h-image.shape[-2]),(0,w-image.shape[-1])),mode='constant');yy,xx=np.mgrid[:h,:w];xx=np.clip(xx+flow[0,0],0,w-1);yy=np.clip(yy+flow[0,1],0,h-1);x0=xx.astype(int);y0=yy.astype(int);x1=np.minimum(x0+1,w-1);y1=np.minimum(y0+1,h-1);dx=xx-x0;dy=yy-y0
 return (image[0,:,y0,x0].transpose(2,0,1)*(1-dx)*(1-dy)+image[0,:,y0,x1].transpose(2,0,1)*dx*(1-dy)+image[0,:,y1,x0].transpose(2,0,1)*(1-dx)*dy+image[0,:,y1,x1].transpose(2,0,1)*dx*dy)[None]
s2=ort.InferenceSession('verification/models/rife49.original.onnx',sess_options=opts,providers=['CPUExecutionProvider']);ref=s2.run(None,{'img0':a,'img1':b,'timestep':np.array([.5],np.float32)})[0];recon=(warp(a,r[0][:,:2])*r[1]+warp(b,r[0][:,2:])*(1-r[1]))[:,:,:64,:96];err=float(np.max(np.abs(ref-recon)));print('full model vs flow+warp maxerror',err);assert err<1e-4
Path('verification/rife-flow-equivalence.json').write_text(json.dumps({'model_sha256':hashlib.sha256(Path('verification/models/rife49.original.onnx').read_bytes()).hexdigest(),'flow_model_sha256':hashlib.sha256(Path('assets/ai/rife49-flow.onnx').read_bytes()).hexdigest(),'reference_input':[1,3,64,96],'timestep':.5,'flow_shape':list(r[0].shape),'mask_shape':list(r[1].shape),'reconstruction_max_abs_error':err,'motion_flow_max':float(np.max(np.abs(r[0])))},indent=2),encoding='utf8')
