require 'spec_helper'

describe Feedback do

  it "has a valid factory" do
    FactoryGirl.create(:feedback).should be_valid
  end

  it "is invalid without a topic" do
    FactoryGirl.build(:feedback, topic: nil).should_not be_valid
  end

  it "is invalid without a body" do
    FactoryGirl.build(:feedback, body: nil).should_not be_valid
  end

  it "is invalid with a tiny body" do
    FactoryGirl.build(:feedback, body: "lorem "*5).should_not be_valid
  end

  it "is invalid with a huge body" do
    FactoryGirl.build(:feedback, body: "lorem "*201).should_not be_valid
  end

end
