import { Content, List, ListItem } from '@patternfly/react-core'

export const START_DATE_HELP =
  'The first calendar day and time your automation is eligible to run. If this field is left empty, the schedule will start upon publishing.'

export const END_DATE_HELP =
  'The final calendar day this schedule is active. The end date must be on or after the start date. Once this date passes, the trigger expires and no further runs are scheduled. If you do not set an end date, the schedule continues until you manually disable it.'

export const FREQUENCY_HELP = (
  <>
    <Content component="p">
      This sets how often the automation repeats, using your start date and trigger time as the anchor.
    </Content>
    <List>
      <ListItem>
        <strong>Does not repeat</strong>: Runs once on your start date and trigger time. (ex: January 15th, 2026 at 9:00
        AM)
      </ListItem>
      <ListItem>
        <strong>Minutely</strong>: Runs every minute dependent on the interval set
      </ListItem>
      <ListItem>
        <strong>Hourly</strong>: Runs every hour dependent on the interval set
      </ListItem>
      <ListItem>
        <strong>Daily</strong>: Runs every day at the same time as your trigger time. (ex: everyday at 9:00 AM)
      </ListItem>
      <ListItem>
        <strong>Weekly</strong>: Runs every week on the same day of the week as your start date and trigger time. (ex:
        every Monday at 9:00 AM)
      </ListItem>
      <ListItem>
        <strong>Monthly</strong>: Runs every month on the same calendar date as your start date and trigger time. (ex:
        every 15th at 9:00 AM)
      </ListItem>
      <ListItem>
        <strong>Yearly</strong>: Runs every year on the same month and trigger time. (ex: every January 15th at 9:00 AM)
      </ListItem>
    </List>
  </>
)

export const INTERVAL_HELP = (
  <>
    <Content component="p">
      Define the gap between each scheduled run. This value works with your selected frequency to determine how often
      the workflow triggers starting from your start date.
    </Content>
    <List>
      <ListItem>
        <strong>Example</strong>: If frequency is set to daily and interval is 1, the workflow runs every day.
      </ListItem>
      <ListItem>
        <strong>Example</strong>: If frequency is set to weekly and interval is 2, the workflow runs every 2 weeks.
      </ListItem>
    </List>
  </>
)

export const SCHEDULE_EXPRESSION_HELP = 'Set a schedule by using a visual schedule builder or a cron expression.'

export const CRON_EXPRESSION_HELP =
  'A cron expression defines a time-based schedule using five fields: [Minute] [Hour] [Day of the Month] [Month] [Day of the Week]. For example, 0 9 * * 1-5 runs at 9:00 AM Monday through Friday. The cron schedule uses the timezone of the browser session that created it.'

export const EXECUTION_CONFLICT_HELP = (
  <>
    <Content component="p">
      Select what happens when a scheduled run overlaps with a run that is still in progress.
    </Content>
    <List>
      <ListItem>
        <strong>Skip</strong> (Default): If the previous run is still in progress, the new run is ignored. Only one
        instance of the workflow runs at a time.
      </ListItem>
      <ListItem>
        <strong>Buffer one</strong>: If runs were skipped because the previous one was still in progress, the system
        will queue one catch-up execution and then resume the normal schedule.
      </ListItem>
      <ListItem>
        <strong>Buffer all</strong>: Every scheduled run is queued, even if previous runs are still in progress.
      </ListItem>
      <ListItem>
        <strong>Allow all</strong>: Start every scheduled run immediately, even if previous runs are still in progress.
        Multiple runs may execute concurrently.
      </ListItem>
      <ListItem>
        <strong>Cancel other</strong>: Cancel the currently in-progress run and start the new one. Only the latest
        scheduled run executes.
      </ListItem>
    </List>
  </>
)
