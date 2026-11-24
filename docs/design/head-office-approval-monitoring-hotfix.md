# Head Office Approval and Monitoring Hotfix

Status: approved through the 2026-11-24 implementation request.

## Confirmation button states

```text
[Cancel] [Confirm]
              |
              v
[Cancel] [Processing... disabled]
              |
        success or failure
              v
[Cancel] [Confirm enabled]
```

- Closing the modal must not discard the callback that is already executing.
- The confirmation button must always return to its default label and enabled state.
- A second click while processing must not trigger another request.

## Monitoring layout

```text
Desktop: [Total] [Submitted] [Missing] [Progress]
Mobile:  [Total] [Submitted]
         [Missing] [Progress]

Section statistics wrap onto additional rows when horizontal space is limited.
Progress bars expose a descriptive accessible label including their percentage.
```

