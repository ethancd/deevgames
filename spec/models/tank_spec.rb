require 'spec_helper'

describe Tank do
  it "has a valid factory" do
    FactoryGirl.create(:tank).should be_valid
  end
end
