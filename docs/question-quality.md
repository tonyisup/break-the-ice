# Question quality

New generated batches, previews, and remixes receive an editorial review after generation. The editor scores natural wording, answerability, style fit, and tone fit from 1 to 5. Each dimension must score at least 4, with no editorial objections, before a question can pass. Existing length, syntax, and content checks still apply.

The editor uses the configured OpenRouter generation preset in a separate request at temperature 0. This adds one model request per batch or remix, with additional latency and provider cost. Transient provider errors use the existing retry policy. A malformed or incomplete review fails the run; a batch with no accepted questions fails rather than publishing rejected text. User-triggered generation failures use the existing usage-refund path.

Generated questions inserted through the batch pipeline retain their four scores in `questions.quality`. Preview and remix text must pass before it is returned. Existing catalog questions are unchanged. Feed ordering alternates styles where possible, but does not assess or rewrite old questions.

The tests verify score parsing, rejection of unreviewed and weak candidates at the database boundary, and preservation of accepted scores. They do not establish the model editor's accuracy. Before changing the rubric or generation preset, compare a sample of accepted and rejected questions by reading them aloud and checking the selected style and tone. In particular, inspect forced metaphors, stacked conditions, and shallow questions labeled as deep.
