export async function runConfirmedAction(confirm, message, action) {
  if (!await confirm(message)) return false;
  await action();
  return true;
}
