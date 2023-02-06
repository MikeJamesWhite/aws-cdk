/// !cdk-integ pragma:ignore-assets
import * as iam from '@aws-cdk/aws-iam';
import * as firehose from '@aws-cdk/aws-kinesisfirehose';
import { Aws, App, Stack, StackProps } from '@aws-cdk/core';
import { IntegTest } from '@aws-cdk/integ-tests';
import { Construct } from 'constructs';
import * as aws_logs from '../lib/index';

class TestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Destination "account" resources
    const destinationAccountStack = new Stack(app, 'DestinationStack');

    const destinationAccountDeliveryStream = new firehose.CfnDeliveryStream(
        destinationAccountStack, "TestFirehoseStream", {
            deliveryStreamName: "TestFirehoseStream",
            deliveryStreamType: 'DirectPut',
        }
    );

    const role = new iam.Role(destinationAccountStack, 'DestinationToFirehoseRole', {
        assumedBy: new iam.ServicePrincipal(`logs.${Aws.REGION}.amazonaws.com`),
        inlinePolicies: {
            FirehosePermission: new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        effect: iam.Effect.ALLOW,
                        actions: [
                            "firehose:PutRecord",
                            "firehose:PutRecordBatch",
                            "firehose:ListDeliveryStreams",
                            "firehose:DescribeDeliveryStream"
                        ],
                        resources: [
                            destinationAccountDeliveryStream.attrArn
                        ]
                    })
                ],
            })
        }
    });

    new aws_logs.CrossAccountDestination(
      destinationAccountStack, 'TestDestinationInDestinationStack', {
        destinationName: 'TestDestination',
        role,
        targetArn: destinationAccountDeliveryStream.attrArn,
      },
    );

    // WHEN Creating a matching destination in the source account
    const destinationInSourceStack = aws_logs.CrossAccountDestination.fromDestinationArn(
      this, 'TestDestinationInSourceStack', `arn:aws:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:destination:TestDestination`,
    );
    
    const logGroup = new aws_logs.LogGroup(this, 'SourceLogGroup');
    logGroup.addSubscriptionFilter('CrossAccountSubscriptionFilter', {
      destination: destinationInSourceStack,
      filterPattern: aws_logs.FilterPattern.allEvents(),
    });
  }
}

const app = new App();
const stack = new TestStack(app, 'cdk-integ-logs-crossaccountdestination');

new IntegTest(app, 'CrossAccountDestinationIntegTest', {
  testCases: [stack],
});

app.synth();
