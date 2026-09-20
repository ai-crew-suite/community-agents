# Vault Implementation Plan

`StateSerializer.ts` (The Cryptographic Guard)

- **What it does:** It acts as an encryption and decoding engine for orchestrator graph checkpoints [Step 14].
- **The Mission:** Before a sensitive snapshot of conversational state is written to the cold database (`CheckpointStore`), the engine calls `StateSerializer.serialize()`. If an enterprise supplies a high-security implementation (like an AWS KMS envelope serializer), it turns clear text context into opaque, encrypted ciphertext blocks (`Uint8Array`) [Step 14]. This fulfills **Section C.2 (Sensitive Payload Opaque Isolation)**.

🗺️ System Blueprint Relationship

```
                     ┌───────────────────────────┐
                     │    createRouter/Factory   │
                     └─────────────┬─────────────┘
                                   │ (Wires up both dependencies)
            ┌──────────────────────┴──────────────────────┐
            ▼                                             ▼
┌───────────────────────┐                    ┌─────────────────────────┐
│   StateSerializer     │                    │      ToolRegistry       │
├───────────────────────┤                    ├─────────────────────────┤
│ • Cryptographic Vault │                    │ • Tool Packing Registry │
│ • Encrypts Checkpoints│                    │ • Functional Executors  │
│ • Handles KMS Secrets │                    │ • Zod Parameter Schemas │
└───────────────────────┘                    └─────────────────────────┘
```

When you look at **Step 14** of your notes, it specifies: *"Build `ToolExecutor` ... and wire stores plus `StateSerializer`"* [Step 14]. This is why they were mentioned together—they are both core engine dependencies initialized by the backend startup factory [Step 14].

------

Now that the structural difference between the **cryptographic state serializer** and the **tool packing registry** is clear, which core system file would you like to refactor next? Let me know if we should proceed with:

1. The **`StateSerializer.ts`** snapshot cipher logic.
2. The **`ToolRegistry.ts`** capability packing logic [Step 16].
