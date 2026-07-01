import { Content, List, ListItem } from '@patternfly/react-core'

export const START_DATE_HELP =
  'This defines the first calendar day and time your automation is eligible to run once the workflow is published.'

export const END_DATE_HELP = (
  <>
    <Content component="p">
      The final calendar day this automation is authorized to run. If this field is left empty, the schedule will not
      have an end date.
    </Content>
    <List>
      <ListItem>
        <strong>Automatic stop</strong>: Once this date passes, the trigger will expire and no further actions will be
        taken.
      </ListItem>
    </List>
    <Content component="p">
      If you leave this blank, the workflow will run indefinitely until you manually disable it.
    </Content>
  </>
)

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
  'A cron expression defines a time-based schedule using five fields. Each field specifies a unit of time.'

export const MISSED_SCHEDULE_HELP = (
  <>
    <Content component="p">
      Select how the system should handle scheduled runs that are delayed or overlap with an ongoing execution.
    </Content>
    <List>
      <ListItem>
        <strong>Skip</strong> (Default): If the previous run is still in progress when the next one is scheduled to
        start, the new run is ignored. This ensures only one instance of the workflow is active at a time and prevents
        backlogs.
      </ListItem>
      <ListItem>
        <strong>Run once</strong>: If multiple scheduled runs were missed (ex: during system maintenance) or are
        overlapping, the system will trigger exactly one catch-up execution immediately and then resume the normal
        schedule.
      </ListItem>
      <ListItem>
        <strong>Run all</strong>: The system will immediately trigger every missed execution that should have occurred
        during the downtime or overlap period. Use this with caution, as it can cause a sudden spike in resource usage.
      </ListItem>
    </List>
  </>
)
