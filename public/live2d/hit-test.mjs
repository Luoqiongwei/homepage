export function barycentric(x,y,ax,ay,bx,by,cx,cy){const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-9)return null;const a=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,b=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,c=1-a-b;return a>=-1e-5&&b>=-1e-5&&c>=-1e-5?[a,b,c]:null;}
export function createModelHitTest(model){
 const internal=model.internalModel,core=internal.coreModel;
 // Read only alpha once. Holes in the bangs must not capture cheek touches.
 const atlases=model.textures.map(texture=>{const image=texture.baseTexture.resource.source,canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,alpha=new Uint8Array(canvas.width*canvas.height);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];return {alpha,width:canvas.width,height:canvas.height};});
 const ids=['hair_front','hair_side_left','hair_side_right','hair_strand_left','hair_strand_right','hair_tail_left','hair_tail_right','ribbon_bow','ribbon_band','ribbon_tail_left','ribbon_tail_right','face','torso'];
 const meshes=ids.map(id=>({id,index:core.getDrawableIndex(id)})).filter(m=>m.index>=0);
 function contains(mesh,p){const i=mesh.index;if(core.getDrawableOpacity(i)<.1)return false;const v=internal.getDrawableVertices(i),indices=core.getDrawableVertexIndices(i),uv=core.getDrawableVertexUvs(i),atlas=atlases[core.getDrawableTextureIndices(i)];
   for(let j=0;j<indices.length;j+=3){const a=indices[j]*2,b=indices[j+1]*2,c=indices[j+2]*2,w=barycentric(p.x,p.y,v[a],v[a+1],v[b],v[b+1],v[c],v[c+1]);if(!w)continue;const u=w[0]*uv[a]+w[1]*uv[b]+w[2]*uv[c],vv=w[0]*uv[a+1]+w[1]*uv[b+1]+w[2]*uv[c+1],x=Math.min(atlas.width-1,Math.max(0,Math.floor(u*atlas.width))),y=Math.min(atlas.height-1,Math.max(0,Math.floor((1-vv)*atlas.height)));if(atlas.alpha[y*atlas.width+x]>48)return true;}return false;
 }
 return point=>{const p=model.toModelPosition(point),orders=core.getDrawableRenderOrders(),face=internal.getDrawableBounds(core.getDrawableIndex('face'));
   meshes.sort((a,b)=>orders[b.index]-orders[a.index]);
   for(const mesh of meshes){if(!contains(mesh,p))continue;let zone=null;if(mesh.id.startsWith('hair'))zone=p.y<face.y+face.height*.28?'headtop':'hair';else if(mesh.id.startsWith('ribbon'))zone='ribbon';else if(mesh.id==='face'){const mouth=internal.getDrawableBounds(core.getDrawableIndex('mouth_closed'));zone=p.x>mouth.x-25&&p.x<mouth.x+mouth.width+25&&p.y>mouth.y-25&&p.y<mouth.y+mouth.height+25?'mouth':'face';}else zone='body';return {zone,x:p.x/internal.originalWidth,y:p.y/internal.originalHeight};}
   return {zone:null,x:p.x/internal.originalWidth,y:p.y/internal.originalHeight};
 };
}
