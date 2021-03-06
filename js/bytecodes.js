BYTECODE_HANDLERS.pushLocal = function(ar, bc) {
  ar.stack.push(ar.locals[bc.index]);
};

BYTECODE_HANDLERS.pushGlobal = function(ar, bc) {
  const g = classes[bc.name];
  if (!g) {
    throw new Error('Unknown global ' + bc.name);
  }
  ar.stack.push(g);
};

BYTECODE_HANDLERS.pushSelf = function(ar, bc) {
  ar.stack.push(ar.locals[0]);
};

BYTECODE_HANDLERS.pushInstVar = function(ar, bc) {
  ar.stack.push(ar.locals[0].$vars[bc.index]);
};

function wrapLiteral(rcvr) {
  if (typeof rcvr === 'string') {
    const inst = mkInstance(classes['String']);
    inst.$vars[STRING_RAW] = rcvr;
    return inst;
  } else if (typeof rcvr === 'number') {
    const inst = mkInstance(classes['Number']);
    inst.$vars[NUMBER_RAW] = rcvr;
    return inst;
  } else if (typeof rcvr === 'boolean') {
    return rcvr ? classes['true'] : classes['false'];
  }
  return rcvr;
}

BYTECODE_HANDLERS.pushLiteral = function(ar, bc) {
  ar.stack.push(wrapLiteral(bc.value));
};

BYTECODE_HANDLERS.storeLocal = function(ar, bc) {
  ar.locals[bc.index] = ar.stack.pop();
};

BYTECODE_HANDLERS.storeInstVar = function(ar, bc) {
  ar.locals[0].$vars[bc.index] = ar.stack.pop();
};

BYTECODE_HANDLERS.startBlock = function(ar, bc) {
  // Bytecode gives argc, argStart and length (in bytecodes).
  // The current PC is the start, and we can give it a slice of args.
  // We construct a BlockClosure, push it, and move the outer PC.
  const closure = mkInstance(classes['BlockClosure']);
  closure.$vars[CLOSURE_BYTECODE] = ar.bytecode.slice(ar.pc, ar.pc + bc.length);
  closure.$vars[CLOSURE_ARGC] = bc.argc;
  closure.$vars[CLOSURE_ARGV] = bc.argStart;
  closure.$vars[CLOSURE_METHOD_RECORD] = ar;

  ar.stack.push(closure);
  ar.pc += bc.length;
};

BYTECODE_HANDLERS.startMethod = function(ar, bc) {
  // Bytecode gives: selector, argc, temps count, length in bytecodes.
  // We built the CompiledMethod instance with those values, push it, and skip
  // over the code.
  const method = mkInstance(classes['CompiledMethod']);
  method.$vars[METHOD_BYTECODE] = ar.bytecode.slice(ar.pc, ar.pc + bc.length);
  method.$vars[METHOD_LOCALS] = 1 + bc.argc + bc.temps;
  method.$vars[METHOD_ARGC] = bc.argc;
  method.$vars[METHOD_SELECTOR] = bc.selector;
  ar.stack.push(method);
  ar.pc += bc.length;
};


BYTECODE_HANDLERS.send = function(ar, bc) {
  // First, look up the target method. We need to check its arg count and such.
  // The receiver is on the stack followed by its arguments: rcvr arg1 arg2...
  const ixReceiver = ar.stack.length - bc.values;
  const receiver = ar.stack[ixReceiver];
  let startingClass = receiver.$class;
  if (bc.super) {
    startingClass = startingClass.$vars[CLASS_VAR_SUPERCLASS];
  }
  const method = methodLookup(bc.selector, startingClass);

  if (!method) {
    throw new DoesNotUnderstandError(
        startingClass.$vars[CLASS_VAR_NAME], bc.selector);
  }

  if (method.$vars[METHOD_ARGC] + 1 !== bc.values) {
    throw new ArgumentCountMismatchError(
        startingClass.$vars[CLASS_VAR_NAME], bc.selector,
        method.$vars[METHOD_ARGC], bc.values - 1);
  }

  // All is good: found the method and it has the right arg count for this send.
  // So we build a new activation record and set it up.
  const locals = ar.stack.splice(ixReceiver); // Removes them from the original, returns the removed items.
  const newAR = activationRecord(ar, locals, method.$vars[METHOD_BYTECODE]);
  newAR.thread.push(newAR);
  // Execution will continue at this new location, then continue after the send.
};

BYTECODE_HANDLERS.dup = function(ar, bc) {
  ar.stack.push(ar.stack[ar.stack.length - 1]);
};

BYTECODE_HANDLERS.drop = function(ar, bc) {
  ar.stack.pop();
};

BYTECODE_HANDLERS.answer = function(ar, bc) {
  // Pop the top of this ar's stack, and push it onto the parent's.
  ar.thread.pop();
  ar.parent.stack.push(ar.stack.pop());
};

BYTECODE_HANDLERS.answerBlock = function(ar, bc) {
  // Pop the top of this ar's stack, and push it onto the *grandparent* stack,
  // eg. the caller of my parent method.
  ar.methodRecord.parent.stack.push(ar.stack.pop());
  ar.thread.popTo(ar.methodRecord.parent);
};

BYTECODE_HANDLERS.answerSelf = function(ar, bc) {
  ar.thread.pop();
  ar.parent.stack.push(ar.locals[0]);
};

BYTECODE_HANDLERS.primitive = function(ar, bc) {
  if (bc.keyword === 'builtin:') {
    const builtin = builtins[bc.name];
    if (!builtin) {
      throw new UnknownBuiltinError(bc.name);
    }
    builtin(ar);
  }
};

