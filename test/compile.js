// test wast compiler

import t, { is, not, ok, same, throws } from 'tst'
import parse from '../src/parse.js'
import compile from '../src/compile.js'
import Wabt from '../lib/wabt.js'
// import Wabt from 'wabt'


function clean (str) {
	if (Array.isArray(str)) str = String.raw.apply(String, arguments)
	return str.trim()
    .replace(/^\s*\n/gm, '') //remove empty lines
    .replace(/^\s*/gm, '') //remove indentation/tabulation
    .replace(/[\n\r]+/g, '\n') //transform all \r to \n
    .replace(/(\s)\s+/g, '$1') //replace duble spaces/tabs to single ones
}

// convert wast code to binary
const wabt = await Wabt()
function compileWat (code, importObj={}) {
  code =
  '(func $i32.log (import "imports" "log") (param i32) (result i32))\n' +
  '(func $i32.log2 (import "imports" "log") (param i32 i32) (result i32 i32))\n' +
  '(func $i32.log3 (import "imports" "log") (param i32 i32 i32) (result i32 i32 i32))\n' +
  '(func $f64.log (import "imports" "log") (param f64) (result f64))\n' +
  '(func $i64.log (import "imports" "log") (param i64) (result i64))\n' +
  code
  const wasmModule = wabt.parseWat('inline', code, {
    // simd: true,
    reference_types: true,
    gc: true
    // function_references: true
  })

  const binary = wasmModule.toBinary({
    log: true,
    canonicalize_lebs: true,
    relocatable: false,
    write_debug_names: false,
  })
  wasmModule.destroy()

  const mod = new WebAssembly.Module(binary.buffer)
  return new WebAssembly.Instance(mod, {
    ...importObj,
    imports: {
      log(...args){ console.log(...args); return args }
    }
  })
}


t('compile: globals basic', t => {
  // TODO: single global
  // TODO: multiply wrong types
  // TODO: define globals via group (a,b,c).

  // FIXME: undefined variable throws error
  // throws(() => compile(analyse(parse(`pi2 = pi*2.0;`))), /pi is not defined/)

  let wat = compile(`
    pi = 3.14;
    pi2 = pi*2.0;
    sampleRate = 44100;
    sampleRate, pi, pi2.
  `)
  let mod = compileWat(wat)
  is(mod.exports.pi.value, 3.14)
  is(mod.exports.pi2.value, 3.14*2)
  is(mod.exports.sampleRate.value, 44100)
})

t('compile: globals multiple', () => {
  // FIXME: must throw
  // let wat = compile(`pi, pi2, sampleRate = 3.14, 3.14*2, 44100.`)
  let wat = compile(`(pi, pi2, sampleRate) = (3.14, 3.14*2, 44100).`)
  let mod = compileWat(wat)
  is(mod.exports.pi.value, 3.14)
  is(mod.exports.pi2.value, 3.14*2)
  is(mod.exports.sampleRate.value, 44100)

  wat = compile(`(a,b) = (-1, -1.0).`)
  mod = compileWat(wat)
  is(mod.exports.a.value, -1)
  is(mod.exports.b.value, -1)

  wat = compile(`(a,b) = (-1, -1.0).`)
  mod = compileWat(wat)
  is(mod.exports.a.value, -1)
  is(mod.exports.b.value, -1)
})

t.todo('compile: export kinds', t => {

  throws(() => analyse(parse(`x,y.;z`)), /export/i)
  is(analyse(parse(`x.`)).export, {x:'global'})
  is(analyse(parse(`x=1.`)).export, {x:'global'})
  is(analyse(parse(`x,y.`)).export, {x:'global',y:'global'})
  is(analyse(parse(`x,y,z.`)).export, {x:'global',y:'global',z:'global'})
  is(analyse(parse(`x=1;x.`)).export, {x:'global'})
  is(analyse(parse(`x=1,y=1;x,y.`)).export, {x:'global',y:'global'})
  is(analyse(parse(`(x,y)=(1,1).`)).export, {x:'global',y:'global'})
})

t('compile: numbers negatives', t => {
  let wat = compile(`x=-1.`)
  let mod = compileWat(wat)
  is(mod.exports.x.value, -1)

  wat = compile(`x=-1.0.`)
  mod = compileWat(wat)
  is(mod.exports.x.value, -1)
})

t('compile: numbers inc/dec', t => {
  let wat = compile(`x=0; y=x++; x,y.`)
  let mod = compileWat(wat)
  is(mod.exports.x.value, 1)
  is(mod.exports.y.value, 0)

  wat = compile(`x=0; y=++x; x,y.`)
  mod = compileWat(wat)
  is(mod.exports.x.value, 1)
  is(mod.exports.y.value, 1)

  wat = compile(`x=0; y=x--; x,y.`)
  mod = compileWat(wat)
  is(mod.exports.x.value, -1)
})

t('compile: conditions or/and', t => {
  let wat, mod
  wat = compile(`z=1||0.`)
  mod = compileWat(wat)
  is(mod.exports.z.value, 1)
  wat = compile(`z=1.2||0.0.`)
  mod = compileWat(wat)
  is(mod.exports.z.value, 1.2)
  wat = compile(`z=1.2||0.`)
  mod = compileWat(wat)
  is(mod.exports.z.value, 1.2)
  wat = compile(`z=1||0.0.`)
  mod = compileWat(wat)
  is(mod.exports.z.value, 1)
  wat = compile(`z=1.2&&0.2.`)
  mod = compileWat(wat)
  is(mod.exports.z.value, 0.2)
  wat = compile(`z=1&&2.`)
  mod = compileWat(wat)
  is(mod.exports.z.value, 2)
})

t('compile: assign/pick cases', t => {
  let wat, mod
  wat = compile(`a=1;b=2;c=(a,b).`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 1)

  wat = compile(`a=1;b=2,c=3;(b,a)=(c,b).`)
  mod = compileWat(wat)
  is(mod.exports.b.value, 3)
  is(mod.exports.a.value, 2)

  wat = compile(`a=1;b=2;(c,b)=(a,b);a,b,c.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 1)
  is(mod.exports.b.value, 2)
  is(mod.exports.a.value, 1)

  wat = compile(`a=1;b=2;(c,a,b)=(a,b).`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 1)
  is(mod.exports.a.value, 2)
  is(mod.exports.b.value, 2)

  wat = compile(`a=1;b=2;(c,d)=(a,b).`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 1)
  is(mod.exports.d.value, 2)

  wat = compile(`a=1;b=2;a,(b,b)=a.`)
  mod = compileWat(wat)
  is(mod.exports.b.value, 1)
  is(mod.exports.a.value, 1)
})

t('compile: conditions', t => {
  let wat, mod
  wat = compile(`a=1;b=2;c=a?1:2.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 1)

  wat = compile(`a=1;b=2;a?c=b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 2)

  wat = compile(`a=0;b=2;a?c=b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 0)

  wat = compile(`a=0.0;b=2.1;a?c=b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 0)

  wat = compile(`a=0.1;b=2.1;a?c=b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 2.1)

  wat = compile(`a=1;b=2;a?:c=b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 0)

  wat = compile(`a=0;b=2;a?:c=b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 2)

  wat = compile(`a=0.0;b=2.1;a?:c=b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 2.1)

  wat = compile(`a=0.0;b=2.1;c=a?b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 0)

  wat = compile(`a=0.1;b=2.1;c=a?b.`)
  mod = compileWat(wat)
  is(mod.exports.c.value, 2.1)
})

t('compile: function oneliners', t => {
  let wat, mod
  // no semi
  wat = compile(`mult(a, b=2) = a * b.`)
  mod = compileWat(wat)
  is(mod.exports.mult(2,4), 8)
  is(mod.exports.mult(2), 4)

  // no result
  mod = compileWat(compile(` mult(a, b) = (a * b). `))
  is(mod.exports.mult(2,4), 8)

  // console.log(compile(` mult = (a, b) -> (b; a * b).`))
  mod = compileWat(compile(` mult(a, b) = (b; a * b).`))
  is(mod.exports.mult(2,4), 8)

  mod = compileWat(compile(` mult(a, b) = (b; a * b;). `))
  is(mod.exports.mult(2,4), 8)
})


t.skip('debugs', t => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const importObject = { env: { memory } };
  let module = compileWat(`
  (func $module/init
    (local i32 i32 i32)
    (i32.const 1)
    (i32.const 2)
    (i32.const 3)
    (local.set 0)(local.set 1)(local.set 2)
    (call $i32.log3 (local.get 0) (local.get 1) (local.get 2))
    (drop)(drop)(drop)
  )
  (start $module/init)
  `, importObject)

  // console.log(module.exports.x(1n))
})

t('compile: misc vars', t => {
  let wat,x;
  x = compileWat(compile(`x;x.`)).exports.x // unknown type falls to f64
  x = compileWat(compile(`x=1;x.`)).exports.x // int type
  x = compileWat(compile(`x=1.0;x.`)).exports.x // float type
  x = compileWat(compile(`x()=1;x.`)).exports.x // func type
  // x = compileWat(compile(`x=0..10;x.`)).exports.x // range type
  x = compileWat(compile(`x=[];x.`)).exports.x // arr type
  x = compileWat(compile(`x;x=1;x.`)).exports.x // late-int type
  x = compileWat(compile(`x;x=1.0;x.`)).exports.x // late-float type
  // x = compileWat(compile(`x;x()=1;x.`)).exports.x // late-func type
  // x = compileWat(compile(`x;x=0..10;x.`)).exports.x // late-range type
  x = compileWat(compile(`x;x=[];x.`)).exports.x // late-arr type
})

t('compile: ranges basic', t => {
  let wat = compile(`x = 11 <? 0..10.`)
  let mod = compileWat(wat)
  is(mod.exports.x.value, 10)

  wat = compile(`x = 0 <? 1..10.`)
  mod = compileWat(wat)
  is(mod.exports.x.value, 1)

  wat = compile(`clamp(x) = (x <? 0..10).`)
  mod = compileWat(wat)
  is(mod.exports.clamp(11), 10)
  is(mod.exports.clamp(-1), 0)
})

t('compile: list basic', t => {
  let wat = compile(`x = [1, 2, 3], y = [4,5,6,7]; x,y,xl=x[],yl=y[].`)
  // console.log(wat)
  let mod = compileWat(wat)
  let {__memory:memory, x, y, xl, yl} = mod.exports
  let xarr = new Float64Array(memory.buffer, x.value, 3)
  // let i32s = new Int32Array(memory.buffer, 0)
  is(xarr[0], 1,'x0')
  is(xarr[1], 2,'x1')
  is(xarr[2], 3,'x2')
  is(xl.value,3,'xlen')
  let yarr = new Float64Array(memory.buffer, y.value, 4)
  is(yarr[0], 4,'y0')
  is(yarr[1], 5,'y1')
  is(yarr[2], 6,'y2')
  is(yarr[3], 7,'y3')
  is(yl.value,4,'ylen')
})

t('compile: list from static range', t => {
  let wat = compile(`x=[..3], y=[0..3]; x,y,xl=x[],yl=y[].`)
  // console.log(wat)
  let mod = compileWat(wat)
  let {__memory:memory, x, y, xl, yl} = mod.exports
  let xarr = new Float64Array(memory.buffer, x.value, 3)
  is(xarr[0], 0,'x0')
  is(xarr[1], 0,'x1')
  is(xarr[2], 0,'x2')
  is(xl.value,3,'xlen')
  let yarr = new Float64Array(memory.buffer, y.value, 4)
  is(yarr[0], 0,'y0')
  is(yarr[1], 1,'y1')
  is(yarr[2], 2,'y2')
  is(yarr[3], 3,'y3')
  is(yl.value,4,'ylen')
})

t.only('compile: list from dynamic range', t => {
  let wat = compile(`a=3, x=[..a], xl=x[].`)
  // , y=[1, x[0]..x[2], 2..-2]; x,y, xl=x[],yl=y[].`)
  // console.log(wat)
  let mod = compileWat(wat)
  let {__memory:memory, x, y, xl, yl} = mod.exports
  let xarr = new Float64Array(memory.buffer, x.value, 3)
  is(xarr[0], 0,'x0')
  is(xarr[1], 0,'x1')
  is(xarr[2], 0,'x2')
  is(xl.value,3,'xlen')
})

t.todo('compile: lists from invalid ranges', t => {
  let wat = compile(`x=[2..]`)
      wat = compile(`x=[..]`)
      wat = compile(`x=[..-2]`)
      wat = compile(`x=[..-2]`)
})

t.todo('compile: lists nested static', t => {
  let wat = compile(`x=[1, y=[2, z=[3]]], w=[1,2], xl=x[], yl=y[], zl=z[], wl=w[].`)
  // console.log(wat)
  let mod = compileWat(wat)
  let {__memory:memory, x, y, z, xl, yl, zl, w, wl} = mod.exports
  let xarr = new Float64Array(memory.buffer, x.value, 3)
  is(xarr[0], 1,'x0')
  is(xarr[1], y.value,'x1')
  is(xl.value, 2,'xlen')
  let yarr = new Float64Array(memory.buffer, y.value, 3)
  is(yarr[0], 2,'y0')
  is(yarr[1], z.value,'y1')
  is(yl.value, 2,'ylen')
  let zarr = new Float64Array(memory.buffer, z.value, 3)
  is(zarr[0], 3,'z0')
  is(zl.value, 1,'zlen')
  let warr = new Float64Array(memory.buffer, w.value, 3)
  is(warr[0], 3,'w0')
  is(wl.value, 1,'wlen')
})

t.todo('compile: list comprehension', t => {
  let wat = compile(`x = [1..3 <| # * 2]`)
})

t.todo('compile: list nested comprehension', t => {
  let wat = compile(`x = [1..3 <| [0..# <| ## * 2]]`)
})

t('compile: list simple write', t => {
  let wat = compile(`x = [..3]; x[0]=1; x.1=2; x[-1]=x[]; x.`)
  // console.log(wat)
  let mod = compileWat(wat)
  let {__memory:memory, x} = mod.exports
  let xarr = new Float64Array(memory.buffer, x.value, 3)
  is(xarr[0], 1,'x0')
  is(xarr[1], 2,'x1')
  is(xarr[2], 3,'x2')

})

t.todo('compile: list wrap index', t => {
  let wat = compile(`x = [1, 2, 3]. x << 1.`)
  // console.log(wat)
  let mod = compileWat(wat)
  let {memory, x, y, xl, yl} = mod.exports
  let xarr = new Float64Array(memory.buffer, x.value, 3)
  is(xarr[0], 1,'x0')
  is(xarr[1], 2,'x1')
  is(xarr[2], 3,'x2')
  is(xl.value,3,'xlen')
  let yarr = new Float64Array(memory.buffer, y.value, 3)
  is(yarr[0], 4,'y0')
  is(yarr[1], 5,'y1')
  is(yarr[2], 6,'y2')
  is(yl.value,3,'ylen')
})

t.todo('compile: sublist', t => {
  let wat = compile(`x = [1,2,3], y = [x].`)
  let mod = compileWat(wat)
  let {__memory:memory, x} = mod.exports
  let arr = new Float64Array(memory.buffer, 0, 2), ptr = x.value
  is(arr[ptr], 1)
  is(arr[ptr+1], 2)
})

t.todo('compile: memory grow', t => {
  let wat = compile(`grow()=[..10].`)
  let mod = compileWat(wat)
  let {__memory:memory, grow} = mod.exports

})

t('compile: loops basic', t => {
  let wat = compile(`x=[1..3]; 0..2 <| x[#]=#+1; x.`)
  let mod = compileWat(wat)
  let {__memory:memory, x} = mod.exports

  let arr = new Float64Array(memory.buffer, x.value, 3)

  is(arr[0], 1)
  is(arr[1], 2)
  is(arr[2], 3)
})

t('compile: loop in loop', t => {
  let wat = compile(`
    x=[..4];
    i=0;
    i<2 |> (
      j=0;
      j<2 |> (
        x[i*2+j]=i*2+j;
        j++
      );
      i++;
    );
  x.`)
  let mod = compileWat(wat)
  let {memory, x} = mod.exports

  let arr = new Float64Array(memory.buffer, x.value, 4)

  is(arr[0], 0)
  is(arr[1], 1)
  is(arr[2], 2)
  is(arr[3], 3)
})

t('compile: simple pipe', t => {
  let wat = compile(`x = [1,2,3]; y = x | x -> x * 2.`)
  console.log(wat)
  let mod = compileWat(wat)
  let {memory, y} = mod.exports
  let arr = new Float64Array(memory.buffer, 0, 3), ptr = y.value
  is(arr[ptr], 2)
  is(arr[ptr+1], 4)
  not(arr[ptr+2], 6)
})

t.todo('compile: audio-gain', t => {
  let wat = compile(`
  blockSize = 1024;
  gain = ([blockSize]data, volume <? 0..1000) -> [data | x -> x * volume];
  `)
  let mod = compileWat(wat)
  let {gain} = mod.exports
  is(gain([1,2,3],2),[2,4,6])

  // let wat = compile(`
  //   blockSize = 1024;
  //   gain = ([2, blockSize]data, volume <? 0..1000) -> [data | ch -> (ch | x -> x * volume)];
  // `)
})



t.todo('compile: sine gen', t => {
  let wat = compile(analyse(parse(`
    pi = 3.14;
    pi2 = pi*2;
    sampleRate = 44100;

    sine(freq) = (
      *phase=0;
      phase += freq * pi2 / sampleRate;
      [sin(phase)].
    ).
  `)))
  console.log(wat)

  is(wat, [])
})


t.todo('compile: imports')



t.todo('compile: errors', t => {
  // undefined exports
  throws(() =>
    compile(parse(`a,b,c.`))
  , /Exporting unknown/)

  // fn overload: prohibited
  throws(() => {

  })
})

t.todo('compile: batch processing', t => {
  is(compile(unbox(parse(`a([b],c) = b*c;`))),
    ['module', '']
  )

  is(compile(unbox(parse(`a(b) = [c];`))),
    ['module', '']
  )
})

